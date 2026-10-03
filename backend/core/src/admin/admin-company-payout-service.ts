import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import {
  CompanyPayoutError,
  type CompanyPayoutRecord,
} from '../payments/company-payout.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PixKeyType } from '../payments/payout.js';
import { requestCompanyPayout } from '../payments/request-company-payout.js';

export function adminCompanyPayoutView(payout: CompanyPayoutRecord) {
  return {
    id: payout.id,
    amountCents: payout.amountCents,
    status: payout.status,
    pixKeyType: payout.pixKeyType,
    pixKeyMasked:
      payout.pixKey.length > 4
        ? `••••${payout.pixKey.slice(-4)}`
        : '••••',
    processor: payout.processor ?? null,
    processorPayoutId: payout.processorPayoutId ?? null,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

export async function saveAdminCompanyPayoutDestination(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  pixKeyType: PixKeyType;
  pixKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const existing = await input.finance.getCompanyPayoutDestination();
  const saved = await input.finance.upsertCompanyPayoutDestination({
    pixKeyType: input.pixKeyType,
    pixKey: input.pixKey,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: existing == null
      ? 'finance.company_payout_destination.created'
      : 'finance.company_payout_destination.updated',
    targetType: 'company_payout_destination',
    targetId: 'default',
    metadata: {
      pixKeyType: saved.pixKeyType,
      pixKeyMasked:
        saved.pixKey.length > 4
          ? `••••${saved.pixKey.slice(-4)}`
          : '••••',
    },
    createdAt: saved.updatedAt,
  });

  return {
    configured: true,
    pixKeyType: saved.pixKeyType,
    pixKeyMasked:
      saved.pixKey.length > 4
        ? `••••${saved.pixKey.slice(-4)}`
        : '••••',
    updatedAt: saved.updatedAt,
  };
}

export async function createAdminCompanyPayout(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  amountCents: number;
  idempotencyKey: string;
  now?: Date;
}) {
  const result = await requestCompanyPayout({
    finance: input.finance,
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    ...(input.now == null ? {} : { now: input.now }),
  });

  if (!result.duplicateRequest) {
    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'finance.company_payout.created',
      targetType: 'company_payout',
      targetId: result.payout.id,
      metadata: {
        amountCents: result.payout.amountCents,
        pixKeyType: result.payout.pixKeyType,
        pixKeyMasked:
          result.payout.pixKey.length > 4
            ? `••••${result.payout.pixKey.slice(-4)}`
            : '••••',
      },
      createdAt: result.payout.createdAt,
    });
  }

  return {
    payout: adminCompanyPayoutView(result.payout),
    duplicate: result.duplicateRequest,
  };
}

export async function cancelAdminCompanyPayout(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  payoutId: string;
  now?: Date;
}) {
  let result;
  try {
    result = await input.finance.cancelCompanyPayout({
      payoutId: input.payoutId,
      ...(input.now == null ? {} : { cancelledAt: input.now }),
    });
  } catch (error) {
    if (
      error instanceof CompanyPayoutError &&
      error.code === 'COMPANY_PAYOUT_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }

  if (!result.duplicateCancellation) {
    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'finance.company_payout.cancelled',
      targetType: 'company_payout',
      targetId: result.payout.id,
      metadata: {
        amountCents: result.payout.amountCents,
        fundsReturnedToCompanyBalance: true,
      },
      createdAt: result.payout.updatedAt,
    });
  }

  return {
    payout: adminCompanyPayoutView(result.payout),
    duplicate: result.duplicateCancellation,
  };
}
