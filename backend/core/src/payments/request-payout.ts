import { randomUUID } from 'node:crypto';

import type { FinanceRepository } from './finance-repository.js';
import {
  PayoutDomainError,
  type DriverPayoutKind,
  type DriverPayoutRecord,
} from './payout.js';

export interface RequestDriverPayoutInput {
  driverId: string;
  /** Valor líquido a enviar por Pix. */
  amountCents: number;
  /** Valor bruto reservado do saldo. */
  requestedAmountCents?: number;
  feeCents?: number;
  payoutKind?: DriverPayoutKind;
  approvedAt?: Date;
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

  const amountCents = input.amountCents;
  const requestedAmountCents =
    input.requestedAmountCents ?? amountCents;
  const feeCents = input.feeCents ?? 0;
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isInteger(requestedAmountCents) ||
    requestedAmountCents <= 0 ||
    !Number.isInteger(feeCents) ||
    feeCents < 0 ||
    requestedAmountCents !== amountCents + feeCents
  ) {
    throw new PayoutDomainError(
      'INVALID_PAYOUT_AMOUNT',
      'Composição do valor do saque é inválida.',
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
    amountCents,
    requestedAmountCents,
    feeCents,
    payoutKind: input.payoutKind ?? 'legacy',
    status: 'requested',
    idempotencyKey,
    pixKeyType: destination.pixKeyType,
    pixKey: destination.pixKey,
    ...(input.approvedAt == null
      ? {}
      : { approvedAt: input.approvedAt.toISOString() }),
    createdAt: instant,
    updatedAt: instant,
  };

  return repository.reserveDriverPayout(payout);
}
