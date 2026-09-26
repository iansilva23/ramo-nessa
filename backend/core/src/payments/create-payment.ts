import { randomUUID } from 'node:crypto';

import {
  isDriverPaymentHoldExpired,
  isRidePreparedForPayment,
  type RideRecord,
} from '../rides/ride.js';
import { isPaymentMethodEnabled, type EnabledPaymentMethod } from './payment-policy.js';
import type { FinanceRepository } from './finance-repository.js';
import { PaymentDomainError, type PaymentRecord } from './payment.js';

export interface CreatePaymentInput {
  ride: RideRecord;
  method: EnabledPaymentMethod;
  processor: string;
  idempotencyKey: string;
  amountCents?: number;
  now?: Date;
}

export async function createPaymentForRide(
  repository: FinanceRepository,
  input: CreatePaymentInput,
): Promise<PaymentRecord> {
  if (!isPaymentMethodEnabled(input.method)) {
    throw new PaymentDomainError(
      'PAYMENT_METHOD_DISABLED',
      'Forma de pagamento não está habilitada.',
    );
  }

  if (input.ride.state !== 'AWAITING_PAYMENT') {
    throw new PaymentDomainError(
      'RIDE_NOT_AWAITING_PAYMENT',
      'Corrida não está aguardando pagamento.',
    );
  }

  if (!isRidePreparedForPayment(input.ride)) {
    throw new PaymentDomainError(
      'RIDE_NOT_PREPARED',
      'Prepare a corrida e reserve um motorista antes do pagamento.',
    );
  }

  const now = input.now ?? new Date();
  if (isDriverPaymentHoldExpired(input.ride, now)) {
    throw new PaymentDomainError(
      'DRIVER_HOLD_EXPIRED',
      'A reserva do motorista expirou. Prepare a corrida novamente.',
    );
  }

  const baseFareAmountCents = input.ride.quote.totalAmountCents;
  const amountCents = input.amountCents ?? baseFareAmountCents;
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents < baseFareAmountCents ||
    (!['pix', 'card'].includes(input.method) &&
      amountCents !== baseFareAmountCents)
  ) {
    throw new PaymentDomainError(
      'INVALID_PAYMENT_AMOUNT',
      'Valor da corrida inválido para pagamento.',
    );
  }

  const key = input.idempotencyKey.trim();
  if (key.length < 8) {
    throw new PaymentDomainError(
      'IDEMPOTENCY_CONFLICT',
      'Chave de idempotência inválida.',
    );
  }

  const existing = await repository.findPaymentByIdempotencyKey(key);
  if (existing != null) {
    const sameRequest =
      existing.rideId === input.ride.id &&
      existing.method === input.method &&
      existing.amountCents === amountCents &&
      existing.processor === input.processor;

    if (!sameRequest) {
      throw new PaymentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'Chave de idempotência já foi usada com outro pagamento.',
      );
    }

    return existing;
  }

  const instant = now.toISOString();
  return repository.createPayment({
    id: randomUUID(),
    rideId: input.ride.id,
    method: input.method,
    processor: input.processor,
    status: 'created',
    amountCents,
    idempotencyKey: key,
    createdAt: instant,
    updatedAt: instant,
  });
}
