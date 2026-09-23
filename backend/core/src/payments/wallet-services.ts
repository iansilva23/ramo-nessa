import { randomUUID } from 'node:crypto';

import {
  isDriverPaymentHoldExpired,
  type RideRecord,
} from '../rides/ride.js';
import type { FinanceRepository } from './finance-repository.js';
import { PaymentDomainError, type PaymentRecord } from './payment.js';
import {
  WalletDomainError,
  type WalletTopupMethod,
  type WalletTopupRecord,
} from './wallet.js';

export async function createWalletTopup(
  repository: FinanceRepository,
  input: {
    passengerId: string;
    method: WalletTopupMethod;
    processor: string;
    amountCents: number;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<WalletTopupRecord> {
  if (input.method !== 'pix' && input.method !== 'card') {
    throw new WalletDomainError(
      'INVALID_TOPUP_METHOD',
      'Recarga aceita somente Pix ou cartão.',
    );
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new WalletDomainError(
      'INVALID_TOPUP_AMOUNT',
      'Valor da recarga deve ser inteiro positivo em centavos.',
    );
  }

  const passengerId = input.passengerId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8) {
    throw new WalletDomainError(
      'WALLET_IDEMPOTENCY_CONFLICT',
      'Chave de idempotência da recarga é inválida.',
    );
  }

  const existing = await repository.findWalletTopupByIdempotencyKey(
    idempotencyKey,
  );
  if (existing != null) {
    const same =
      existing.passengerId === passengerId &&
      existing.method === input.method &&
      existing.processor === input.processor &&
      existing.amountCents === input.amountCents;

    if (!same) {
      throw new WalletDomainError(
        'WALLET_IDEMPOTENCY_CONFLICT',
        'Chave de idempotência já utilizada em outra recarga.',
      );
    }

    return existing;
  }

  const instant = (input.now ?? new Date()).toISOString();
  return repository.createWalletTopup({
    id: randomUUID(),
    passengerId,
    method: input.method,
    processor: input.processor,
    status: 'pending',
    amountCents: input.amountCents,
    idempotencyKey,
    createdAt: instant,
    updatedAt: instant,
  });
}

export async function payRideWithWallet(
  repository: FinanceRepository,
  input: {
    ride: RideRecord;
    passengerId: string;
    idempotencyKey: string;
    now?: Date;
  },
) {
  if (input.ride.passengerId !== input.passengerId) {
    throw new WalletDomainError(
      'RIDE_PASSENGER_MISMATCH',
      'A corrida não pertence ao passageiro da carteira.',
    );
  }

  if (input.ride.state !== 'AWAITING_PAYMENT') {
    throw new WalletDomainError(
      'RIDE_NOT_AWAITING_WALLET_PAYMENT',
      'A corrida não está aguardando pagamento.',
    );
  }

  const now = input.now ?? new Date();
  if (isDriverPaymentHoldExpired(input.ride, now)) {
    throw new PaymentDomainError(
      'DRIVER_HOLD_EXPIRED',
      'A reserva do motorista expirou. Prepare a corrida novamente.',
    );
  }

  const key = input.idempotencyKey.trim();
  if (key.length < 8) {
    throw new WalletDomainError(
      'WALLET_IDEMPOTENCY_CONFLICT',
      'Chave de idempotência do pagamento é inválida.',
    );
  }

  const instant = now.toISOString();
  const payment: PaymentRecord = {
    id: randomUUID(),
    rideId: input.ride.id,
    method: 'wallet',
    processor: 'internal-wallet',
    status: 'paid',
    amountCents: input.ride.quote.totalAmountCents,
    idempotencyKey: key,
    createdAt: instant,
    updatedAt: instant,
  };

  return repository.payRideFromWallet({
    passengerId: input.passengerId,
    payment,
  });
}

export async function passengerWalletBalanceCents(
  repository: FinanceRepository,
  passengerId: string,
): Promise<number> {
  return repository.getAccountBalanceCents(
    `passenger:${passengerId}:wallet`,
  );
}
