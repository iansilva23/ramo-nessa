import type { PaymentRecord } from './payment.js';
import type { RideRecord } from '../rides/ride.js';
import type { FinanceRepository } from './finance-repository.js';

export class SettlementError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_COMPLETED'
      | 'DRIVER_NOT_ASSIGNED'
      | 'PAYMENT_NOT_PAID'
      | 'PAYMENT_RIDE_MISMATCH'
      | 'PAYMENT_AMOUNT_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

export interface SettleCompletedRideInput {
  ride: RideRecord;
  payment: PaymentRecord;
  settledAt?: Date;
}

export async function settleCompletedRide(
  repository: FinanceRepository,
  input: SettleCompletedRideInput,
) {
  if (input.ride.state !== 'COMPLETED') {
    throw new SettlementError(
      'RIDE_NOT_COMPLETED',
      'A corrida precisa estar COMPLETED antes da liquidação.',
    );
  }

  const driverId = input.ride.driverId?.trim();
  if (!driverId) {
    throw new SettlementError(
      'DRIVER_NOT_ASSIGNED',
      'A corrida concluída precisa ter motorista atribuído.',
    );
  }

  if (input.payment.status !== 'paid') {
    throw new SettlementError(
      'PAYMENT_NOT_PAID',
      'O pagamento precisa estar pago antes da liquidação.',
    );
  }

  if (input.payment.rideId !== input.ride.id) {
    throw new SettlementError(
      'PAYMENT_RIDE_MISMATCH',
      'Pagamento não pertence à corrida.',
    );
  }

  const fareAmountCents = input.ride.quote.totalAmountCents;
  const validPaymentAmount =
    input.payment.method === 'card'
      ? input.payment.amountCents >= fareAmountCents
      : input.payment.amountCents === fareAmountCents;
  if (!validPaymentAmount) {
    throw new SettlementError(
      'PAYMENT_AMOUNT_MISMATCH',
      'Valor pago não confere com o preço aplicável à forma de pagamento.',
    );
  }
  const paymentAdjustmentCents =
    input.payment.amountCents - fareAmountCents;

  return repository.settleRide({
    rideId: input.ride.id,
    paymentId: input.payment.id,
    driverId,
    totalAmountCents: input.payment.amountCents,
    fareAmountCents,
    paymentAdjustmentCents,
    platformCommissionCents: input.ride.quote.platformCommissionCents,
    driverNetCents: input.ride.quote.driverNetCents,
    ...(input.settledAt != null ? { settledAt: input.settledAt } : {}),
  });
}
