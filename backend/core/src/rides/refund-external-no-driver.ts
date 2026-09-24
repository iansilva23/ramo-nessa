import { notifyDefaultPushSubject } from '../notifications/push-notification-service.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { MercadoPagoOrdersClient } from '../payments/mercado-pago-orders.js';
import type { PaymentRecord } from '../payments/payment.js';
import type { RideRepository } from './ride-repository.js';
import { transitionRide } from './ride-state.js';
import type { RideRecord } from './ride.js';

export class ExternalRideRefundError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'RIDE_PASSENGER_MISMATCH'
      | 'PAYMENT_NOT_FOUND'
      | 'PAYMENT_RIDE_MISMATCH'
      | 'PAYMENT_GATEWAY_REFERENCE_MISSING'
      | 'REFUND_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'ExternalRideRefundError';
  }
}

export interface ExternalRideRefundResult {
  ride: RideRecord;
  payment: PaymentRecord;
  duplicateRefund: boolean;
}

export async function refundMercadoPagoRideAfterNoDriver(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient;
  rideId: string;
  paymentId: string;
  passengerId: string;
  now?: Date;
}): Promise<ExternalRideRefundResult> {
  let ride = await input.rides.findById(input.rideId);
  if (ride == null) {
    throw new ExternalRideRefundError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada para estorno.',
    );
  }

  if (ride.passengerId !== input.passengerId) {
    throw new ExternalRideRefundError(
      'RIDE_PASSENGER_MISMATCH',
      'Corrida não pertence ao passageiro do estorno.',
    );
  }

  let payment = await input.finance.findPaymentById(input.paymentId);
  if (payment == null) {
    throw new ExternalRideRefundError(
      'PAYMENT_NOT_FOUND',
      'Pagamento não encontrado para estorno.',
    );
  }

  if (
    payment.rideId !== ride.id ||
    payment.processor !== 'mercado-pago-orders' ||
    (payment.method !== 'pix' && payment.method !== 'card')
  ) {
    throw new ExternalRideRefundError(
      'PAYMENT_RIDE_MISMATCH',
      'Pagamento não corresponde à corrida do gateway.',
    );
  }

  if (
    ride.state === 'REFUNDED' &&
    ride.paymentStatus === 'refunded' &&
    payment.status === 'refunded'
  ) {
    const refund = await input.finance.refundExternalPayment({
      paymentId: payment.id,
      ...(input.now != null ? { refundedAt: input.now } : {}),
    });
    return {
      ride,
      payment: refund.payment,
      duplicateRefund: true,
    };
  }

  if (
    ride.state !== 'PAID' &&
    ride.state !== 'NO_DRIVER_FOUND' &&
    ride.state !== 'REFUND_PENDING'
  ) {
    throw new ExternalRideRefundError(
      'REFUND_NOT_ALLOWED',
      `Corrida em estado ${ride.state} não pode ser estornada por falta de motorista.`,
    );
  }

  const instant = (input.now ?? new Date()).toISOString();

  if (ride.state === 'PAID' || ride.state === 'NO_DRIVER_FOUND') {
    const {
      reservedDriverId: _reservedDriverId,
      driverHoldExpiresAt: _driverHoldExpiresAt,
      ...withoutHold
    } = ride;

    ride = await input.rides.save({
      ...withoutHold,
      state: transitionRide(ride.state, 'REFUND_PENDING'),
      updatedAt: instant,
    });
  }

  if (payment.status !== 'refunded') {
    if (payment.status !== 'paid') {
      throw new ExternalRideRefundError(
        'REFUND_NOT_ALLOWED',
        `Pagamento em estado ${payment.status} não pode ser estornado.`,
      );
    }

    const orderId = payment.processorPaymentId?.trim();
    if (!orderId) {
      throw new ExternalRideRefundError(
        'PAYMENT_GATEWAY_REFERENCE_MISSING',
        'Pagamento não possui referência da Order do Mercado Pago.',
      );
    }

    await input.gateway.refundOrder(
      orderId,
      `refund-${payment.id}`,
    );
  }

  const refund = await input.finance.refundExternalPayment({
    paymentId: payment.id,
    ...(input.now != null ? { refundedAt: input.now } : {}),
  });
  payment = refund.payment;

  const latestRide = (await input.rides.findById(ride.id)) ?? ride;
  if (
    latestRide.state === 'REFUNDED' &&
    latestRide.paymentStatus === 'refunded'
  ) {
    return {
      ride: latestRide,
      payment,
      duplicateRefund: true,
    };
  }

  if (latestRide.state !== 'REFUND_PENDING') {
    throw new ExternalRideRefundError(
      'REFUND_NOT_ALLOWED',
      `Corrida em estado ${latestRide.state} não pode concluir o estorno.`,
    );
  }

  const refundedRide = await input.rides.save({
    ...latestRide,
    state: transitionRide(latestRide.state, 'REFUNDED'),
    paymentStatus: payment.status,
    updatedAt: instant,
  });

  notifyDefaultPushSubject({
    subjectType: 'passenger',
    subjectId: refundedRide.passengerId,
    message: {
      type: 'passenger.payment.refunded',
      title: 'Estorno concluído',
      body: 'O valor da corrida foi devolvido pelo Mercado Pago.',
      data: { rideId: refundedRide.id },
    },
  });

  return {
    ride: refundedRide,
    payment,
    duplicateRefund: refund.duplicateRefund,
  };
}
