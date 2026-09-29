import type { FinanceRepository } from '../payments/finance-repository.js';
import type { MercadoPagoOrdersClient } from '../payments/mercado-pago-orders.js';
import type { PaymentRecord } from '../payments/payment.js';
import {
  refundMercadoPagoRide,
} from './refund-external-no-driver.js';
import {
  refundWalletRide,
} from './refund-no-driver.js';
import type { RideRepository } from './ride-repository.js';
import { transitionRide } from './ride-state.js';
import type { RideRecord } from './ride.js';

export type AutomaticRideRefundStatus =
  | 'refunded'
  | 'pending_external_gateway'
  | 'not_charged';

export interface AutomaticRideRefundResult {
  ride: RideRecord;
  payment: PaymentRecord | null;
  refundStatus: AutomaticRideRefundStatus;
  duplicateRefund: boolean;
}

async function markRefundPending(
  rides: RideRepository,
  ride: RideRecord,
  now: Date,
): Promise<RideRecord> {
  if (ride.state === 'REFUND_PENDING' || ride.state === 'REFUNDED') {
    return ride;
  }
  return rides.save({
    ...ride,
    state: transitionRide(ride.state, 'REFUND_PENDING'),
    updatedAt: now.toISOString(),
  });
}

export async function automaticallyRefundRide(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  rideId: string;
  passengerId: string;
  now?: Date;
}): Promise<AutomaticRideRefundResult> {
  const now = input.now ?? new Date();
  let ride = await input.rides.findById(input.rideId);
  if (ride == null) {
    throw new Error('Corrida não encontrada para reembolso automático.');
  }
  if (ride.passengerId !== input.passengerId) {
    throw new Error('Passageiro não corresponde à corrida do reembolso.');
  }

  const payment = await input.finance.findLatestPaymentByRideId(ride.id);
  if (payment == null) {
    if (ride.paymentMethod === 'cash') {
      return {
        ride,
        payment: null,
        refundStatus: 'not_charged',
        duplicateRefund: false,
      };
    }
    throw new Error('Pagamento da corrida não foi encontrado para reembolso.');
  }

  if (payment.method === 'wallet') {
    const refund = await refundWalletRide({
      rides: input.rides,
      finance: input.finance,
      rideId: ride.id,
      paymentId: payment.id,
      passengerId: input.passengerId,
      now,
    });
    return {
      ride: refund.ride,
      payment: refund.payment,
      refundStatus: 'refunded',
      duplicateRefund: refund.duplicateRefund,
    };
  }

  if (
    payment.processor === 'mercado-pago-orders' &&
    (payment.method === 'pix' || payment.method === 'card')
  ) {
    if (input.gateway == null) {
      ride = await markRefundPending(input.rides, ride, now);
      return {
        ride,
        payment,
        refundStatus: 'pending_external_gateway',
        duplicateRefund: false,
      };
    }

    const refund = await refundMercadoPagoRide({
      rides: input.rides,
      finance: input.finance,
      gateway: input.gateway,
      rideId: ride.id,
      paymentId: payment.id,
      passengerId: input.passengerId,
      now,
    });
    return {
      ride: refund.ride,
      payment: refund.payment,
      refundStatus:
        refund.ride.state === 'REFUNDED'
          ? 'refunded'
          : 'pending_external_gateway',
      duplicateRefund: refund.duplicateRefund,
    };
  }

  ride = await markRefundPending(input.rides, ride, now);
  return {
    ride,
    payment,
    refundStatus: 'pending_external_gateway',
    duplicateRefund: false,
  };
}
