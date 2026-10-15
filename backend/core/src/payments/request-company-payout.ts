import { randomUUID } from 'node:crypto';

import type { FinanceRepository } from './finance-repository.js';
import {
  CompanyPayoutError,
  type CompanyPayoutRecord,
} from './company-payout.js';

export async function requestCompanyPayout(input: {
  finance: FinanceRepository;
  amountCents: number;
  idempotencyKey: string;
  now?: Date;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) {
    throw new CompanyPayoutError(
      'INVALID_COMPANY_PAYOUT_AMOUNT',
      'O repasse da empresa deve ser de pelo menos R$ 1,00.',
    );
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8) {
    throw new CompanyPayoutError(
      'INVALID_COMPANY_PAYOUT_IDEMPOTENCY_KEY',
      'Chave de idempotência do repasse da empresa é inválida.',
    );
  }

  const destination = await input.finance.getCompanyPayoutDestination();
  if (destination == null) {
    throw new CompanyPayoutError(
      'COMPANY_PAYOUT_DESTINATION_REQUIRED',
      'Cadastre a chave Pix da empresa antes de solicitar o repasse.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  const payout: CompanyPayoutRecord = {
    id: randomUUID(),
    amountCents: input.amountCents,
    status: 'requested',
    idempotencyKey,
    pixKeyType: destination.pixKeyType,
    pixKey: destination.pixKey,
    createdAt: instant,
    updatedAt: instant,
  };

  return input.finance.reserveCompanyPayout(payout);
}
