import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import {
  PayoutDomainError,
  payoutFeeCents,
  payoutKind,
  payoutRequestedAmountCents,
  type DriverPayoutRecord,
} from '../payments/payout.js';
import {
  createManualDriverPayouts,
} from '../payments/driver-payout-policy-service.js';

export class AdminPayoutError extends Error {
  constructor(
    public readonly code:
      | 'PAYOUT_NOT_FOUND'
      | 'INVALID_PAYOUT_PROCESSOR'
      | 'INVALID_PAYOUT_REFERENCE',
    message: string,
  ) {
    super(message);
    this.name = 'AdminPayoutError';
  }
}

function normalizeProcessor(value: string): string {
  const processor = value.trim().replace(/\s+/g, ' ');
  if (processor.length < 2 || processor.length > 80) {
    throw new AdminPayoutError(
      'INVALID_PAYOUT_PROCESSOR',
      'Informe o método ou processador usado no repasse.',
    );
  }
  return processor;
}

function normalizeReference(value: string | undefined): string | undefined {
  const reference = value?.trim();
  if (!reference) return undefined;
  if (reference.length > 160) {
    throw new AdminPayoutError(
      'INVALID_PAYOUT_REFERENCE',
      'A referência do repasse deve ter no máximo 160 caracteres.',
    );
  }
  return reference;
}

export function adminPayoutDetailView(payout: DriverPayoutRecord) {
  return {
    id: payout.id,
    driverId: payout.driverId,
    amountCents: payout.amountCents,
    requestedAmountCents: payoutRequestedAmountCents(payout),
    feeCents: payoutFeeCents(payout),
    payoutKind: payoutKind(payout),
    approvedAt: payout.approvedAt ?? null,
    requiresApproval:
      payoutKind(payout) === 'anticipation' && payout.approvedAt == null,
    status: payout.status,
    pixKeyType: payout.pixKeyType,
    pixKey: payout.pixKey,
    processor: payout.processor ?? null,
    processorPayoutId: payout.processorPayoutId ?? null,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

export async function getAdminPayoutDetail(input: {
  finance: FinanceRepository;
  payoutId: string;
}) {
  const payout = await input.finance.findDriverPayoutById(
    input.payoutId,
  );
  if (payout == null) {
    throw new AdminPayoutError(
      'PAYOUT_NOT_FOUND',
      'Saque não encontrado.',
    );
  }
  return adminPayoutDetailView(payout);
}

export async function completeAdminPayout(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  payoutId: string;
  processor: string;
  processorPayoutId?: string;
  now?: Date;
}) {
  const processor = normalizeProcessor(input.processor);
  const processorPayoutId = normalizeReference(
    input.processorPayoutId,
  );
  let result;
  try {
    result = await input.finance.completeDriverPayout({
      payoutId: input.payoutId,
      processor,
      ...(processorPayoutId == null ? {} : { processorPayoutId }),
      ...(input.now == null ? {} : { completedAt: input.now }),
    });
  } catch (error) {
    if (
      error instanceof PayoutDomainError &&
      error.code === 'PAYOUT_NOT_FOUND'
    ) {
      throw new AdminPayoutError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }
    throw error;
  }

  if (!result.duplicateCompletion) {
    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'finance.payout.paid',
      targetType: 'driver_payout',
      targetId: result.payout.id,
      metadata: {
        driverId: result.payout.driverId,
        amountCents: result.payout.amountCents,
        processor,
        hasExternalReference: processorPayoutId != null,
      },
      createdAt: result.payout.updatedAt,
    });
  }

  return {
    payout: adminPayoutDetailView(result.payout),
    duplicate: result.duplicateCompletion,
  };
}

export async function cancelAdminPayout(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  payoutId: string;
  now?: Date;
}) {
  let result;
  try {
    result = await input.finance.cancelDriverPayout({
      payoutId: input.payoutId,
      ...(input.now == null ? {} : { cancelledAt: input.now }),
    });
  } catch (error) {
    if (
      error instanceof PayoutDomainError &&
      error.code === 'PAYOUT_NOT_FOUND'
    ) {
      throw new AdminPayoutError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }
    throw error;
  }

  if (!result.duplicateCancellation) {
    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'finance.payout.cancelled',
      targetType: 'driver_payout',
      targetId: result.payout.id,
      metadata: {
        driverId: result.payout.driverId,
        amountCents: result.payout.amountCents,
        fundsReturnedToDriverBalance: true,
      },
      createdAt: result.payout.updatedAt,
    });
  }

  return {
    payout: adminPayoutDetailView(result.payout),
    duplicate: result.duplicateCancellation,
  };
}


export async function approveAdminPayout(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  payoutId: string;
  now?: Date;
}) {
  const result = await input.finance.approveDriverPayout({
    payoutId: input.payoutId,
    ...(input.now == null ? {} : { approvedAt: input.now }),
  });

  if (!result.duplicateApproval) {
    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'finance.payout.approved',
      targetType: 'driver_payout',
      targetId: result.payout.id,
      metadata: {
        driverId: result.payout.driverId,
        requestedAmountCents: payoutRequestedAmountCents(result.payout),
        feeCents: payoutFeeCents(result.payout),
        amountCents: result.payout.amountCents,
        payoutKind: payoutKind(result.payout),
      },
      createdAt: result.payout.updatedAt,
    });
  }

  return {
    payout: adminPayoutDetailView(result.payout),
    duplicate: result.duplicateApproval,
  };
}

export async function updateAdminPayoutAutomaticMode(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  automaticEnabled: boolean;
  now?: Date;
}) {
  const current = await input.finance.getDriverPayoutSettings();
  if (current.automaticEnabled === input.automaticEnabled) {
    return current;
  }

  const updated = await input.finance.setDriverPayoutAutomaticEnabled({
    automaticEnabled: input.automaticEnabled,
    ...(input.now == null ? {} : { updatedAt: input.now }),
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'finance.payout.mode.updated',
    targetType: 'driver_payout_settings',
    targetId: 'default',
    metadata: {
      previousAutomaticEnabled: current.automaticEnabled,
      automaticEnabled: updated.automaticEnabled,
    },
    createdAt: updated.updatedAt,
  });
  return updated;
}

export async function createAdminManualPayoutBatch(input: {
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverIds: readonly string[];
  batchId: string;
  now?: Date;
}) {
  const result = await createManualDriverPayouts({
    finance: input.finance,
    driverIds: input.driverIds,
    batchId: input.batchId,
    ...(input.now == null ? {} : { now: input.now }),
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'finance.payout.manual_batch.created',
    targetType: 'driver_payout_batch',
    targetId: input.batchId,
    metadata: {
      requestedDrivers: input.driverIds.length,
      created: result.created.length,
      skipped: result.skipped.length,
      payoutIds: result.created.map((payout) => payout.id),
    },
    createdAt: (input.now ?? new Date()).toISOString(),
  });

  return result;
}
