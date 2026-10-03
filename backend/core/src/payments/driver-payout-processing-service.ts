import type { FinanceRepository } from './finance-repository.js';
import type {
  DriverPayoutProvider,
  DriverPayoutProviderResult,
} from './driver-payout-provider.js';
import {
  PayoutDomainError,
  payoutRequiresAdminApproval,
  type DriverPayoutRecord,
} from './payout.js';

export type DriverPayoutProcessingOutcome =
  | {
      kind: 'paid';
      payout: DriverPayoutRecord;
      providerPayoutId: string;
    }
  | {
      kind: 'processing';
      payout: DriverPayoutRecord;
      providerPayoutId: string;
    }
  | {
      kind: 'failed';
      payout: DriverPayoutRecord;
      providerPayoutId: string;
    }
  | {
      kind: 'terminal';
      payout: DriverPayoutRecord;
    };

async function applyProviderResult(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  payout: DriverPayoutRecord;
  result: DriverPayoutProviderResult;
  now?: Date;
}): Promise<DriverPayoutProcessingOutcome> {
  if (input.result.status === 'paid') {
    const completed = await input.finance.completeDriverPayout({
      payoutId: input.payout.id,
      processor: input.provider.name,
      processorPayoutId: input.result.providerPayoutId,
      ...(input.now == null ? {} : { completedAt: input.now }),
    });
    return {
      kind: 'paid',
      payout: completed.payout,
      providerPayoutId: input.result.providerPayoutId,
    };
  }

  if (input.result.status === 'failed') {
    const failed = await input.finance.failDriverPayout({
      payoutId: input.payout.id,
      processor: input.provider.name,
      processorPayoutId: input.result.providerPayoutId,
      ...(input.now == null ? {} : { failedAt: input.now }),
    });
    return {
      kind: 'failed',
      payout: failed.payout,
      providerPayoutId: input.result.providerPayoutId,
    };
  }

  const started = await input.finance.startDriverPayout({
    payoutId: input.payout.id,
    processor: input.provider.name,
    processorPayoutId: input.result.providerPayoutId,
    ...(input.now == null ? {} : { startedAt: input.now }),
  });
  return {
    kind: 'processing',
    payout: started.payout,
    providerPayoutId: input.result.providerPayoutId,
  };
}

export async function processDriverPayout(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  payoutId: string;
  now?: Date;
}): Promise<DriverPayoutProcessingOutcome> {
  const payout = await input.finance.findDriverPayoutById(input.payoutId);
  if (payout == null) {
    throw new Error('Saque reservado não foi encontrado.');
  }

  if (
    payout.status === 'paid' ||
    payout.status === 'failed' ||
    payout.status === 'cancelled'
  ) {
    return { kind: 'terminal', payout };
  }

  if (
    payout.status === 'requested' &&
    payoutRequiresAdminApproval(payout)
  ) {
    throw new PayoutDomainError(
      'PAYOUT_APPROVAL_REQUIRED',
      'Antecipação aguarda aprovação administrativa.',
    );
  }

  if (payout.status === 'processing') {
    if (
      payout.processor !== input.provider.name ||
      payout.processorPayoutId == null
    ) {
      throw new Error(
        'Saque em processamento não corresponde ao provedor configurado.',
      );
    }

    const result = await input.provider.getPayoutStatus(
      payout.processorPayoutId,
    );
    if (result.providerPayoutId !== payout.processorPayoutId) {
      throw new Error(
        'Provedor retornou referência diferente na conciliação do saque.',
      );
    }
    return applyProviderResult({
      ...input,
      payout,
      result,
    });
  }

  const result = await input.provider.createPixPayout({
    payoutId: payout.id,
    amountCents: payout.amountCents,
    pixKeyType: payout.pixKeyType,
    pixKey: payout.pixKey,
  });
  return applyProviderResult({
    ...input,
    payout,
    result,
  });
}

export async function reconcileDriverPayouts(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  limit?: number;
}): Promise<{
  processed: number;
  paid: number;
  processing: number;
  failed: number;
  errors: number;
}> {
  const payouts = await input.finance.listDriverPayoutsByStatus(
    ['requested', 'processing'],
    input.limit ?? 50,
  );

  let paid = 0;
  let processing = 0;
  let failed = 0;
  let errors = 0;

  for (const payout of payouts) {
    if (
      payout.status === 'requested' &&
      payoutRequiresAdminApproval(payout)
    ) {
      continue;
    }
    try {
      const result = await processDriverPayout({
        finance: input.finance,
        provider: input.provider,
        payoutId: payout.id,
      });
      if (result.kind === 'paid') paid += 1;
      if (result.kind === 'processing') processing += 1;
      if (result.kind === 'failed') failed += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    processed: payouts.length,
    paid,
    processing,
    failed,
    errors,
  };
}
