import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentRecord } from '../payments/payment.js';
import type { RideRepository } from './ride-repository.js';
import { transitionRide } from './ride-state.js';
import type { RideRecord } from './ride.js';

export class RideRefundError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'RIDE_PASSENGER_MISMATCH'
      | 'PAYMENT_NOT_FOUND'
      | 'PAYMENT_RIDE_MISMATCH'
      | 'REFUND_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'RideRefundError';
  }
}

export interface RideRefundResult {
  ride: RideRecord;
  payment: PaymentRecord;
  duplicateRefund: boolean;
}

export async function refundWalletRideAfterNoDriver(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  rideId: string;
  paymentId: string;
  passengerId: string;
  now?: Date;
}): Promise<RideRefundResult> {
  let ride = await input.rides.findById(input.rideId);
  if (ride == null) {
    throw new RideRefundError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada para estorno.',
    );
  }

  if (ride.passengerId !== input.passengerId) {
    throw new RideRefundError(
      'RIDE_PASSENGER_MISMATCH',
      'Corrida não pertence ao passageiro do estorno.',
    );
  }

  const payment = await input.finance.findPaymentById(input.paymentId);
  if (payment == null) {
    throw new RideRefundError(
      'PAYMENT_NOT_FOUND',
      'Pagamento não encontrado para estorno.',
    );
  }

  if (
    payment.rideId !== ride.id ||
    payment.method !== 'wallet' ||
    payment.processor !== 'internal-wallet'
  ) {
    throw new RideRefundError(
      'PAYMENT_RIDE_MISMATCH',
      'Pagamento não corresponde à corrida da carteira.',
    );
  }

  if (
    ride.state === 'REFUNDED' &&
    ride.paymentStatus === 'refunded' &&
    payment.status === 'refunded'
  ) {
    const refund = await input.finance.refundWalletRide({
      paymentId: payment.id,
      passengerId: input.passengerId,
      ...(input.now != null ? { refundedAt: input.now } : {}),
    });
    return {
      ride,
      payment: refund.payment,
      duplicateRefund: true,
    };
  }

  if (
    ride.state !== 'NO_DRIVER_FOUND' &&
    ride.state !== 'REFUND_PENDING'
  ) {
    throw new RideRefundError(
      'REFUND_NOT_ALLOWED',
      `Corrida em estado ${ride.state} não pode ser estornada por falta de motorista.`,
    );
  }

  const instant = (input.now ?? new Date()).toISOString();

  if (ride.state === 'NO_DRIVER_FOUND') {
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

  const refund = await input.finance.refundWalletRide({
    paymentId: payment.id,
    passengerId: input.passengerId,
    ...(input.now != null ? { refundedAt: input.now } : {}),
  });

  const latestRide = (await input.rides.findById(ride.id)) ?? ride;
  if (
    latestRide.state === 'REFUNDED' &&
    latestRide.paymentStatus === 'refunded'
  ) {
    return {
      ride: latestRide,
      payment: refund.payment,
      duplicateRefund: true,
    };
  }

  if (latestRide.state !== 'REFUND_PENDING') {
    throw new RideRefundError(
      'REFUND_NOT_ALLOWED',
      `Corrida em estado ${latestRide.state} não pode concluir o estorno.`,
    );
  }

  const refundedRide = await input.rides.save({
    ...latestRide,
    state: transitionRide(latestRide.state, 'REFUNDED'),
    paymentStatus: refund.payment.status,
    updatedAt: instant,
  });

  return {
    ride: refundedRide,
    payment: refund.payment,
    duplicateRefund: refund.duplicateRefund,
  };
}
