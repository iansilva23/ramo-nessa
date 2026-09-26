import { randomUUID } from 'node:crypto';

import type { FinanceRepository } from './finance-repository.js';
import {
  PayoutDomainError,
  type DriverPayoutRecord,
} from './payout.js';

export interface RequestDriverPayoutInput {
  driverId: string;
  amountCents: number;
  idempotencyKey: string;
  now?: Date;
}

export async function requestDriverPayout(
  repository: FinanceRepository,
  input: RequestDriverPayoutInput,
) {
  const driverId = input.driverId.trim();
  if (driverId.length < 3) {
    throw new PayoutDomainError(
      'INVALID_DRIVER',
      'Identidade do motorista inválida.',
    );
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new PayoutDomainError(
      'INVALID_PAYOUT_AMOUNT',
      'Valor do saque deve ser inteiro positivo em centavos.',
    );
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8) {
    throw new PayoutDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Chave de idempotência do saque é inválida.',
    );
  }

  const destination =
    await repository.getDriverPayoutDestination(driverId);
  if (destination == null) {
    throw new PayoutDomainError(
      'PAYOUT_DESTINATION_REQUIRED',
      'Cadastre uma chave Pix antes de solicitar o saque.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  const payout: DriverPayoutRecord = {
    id: randomUUID(),
    driverId,
    amountCents: input.amountCents,
    status: 'requested',
    idempotencyKey,
    pixKeyType: destination.pixKeyType,
    pixKey: destination.pixKey,
    createdAt: instant,
    updatedAt: instant,
  };

  return repository.reserveDriverPayout(payout);
}
