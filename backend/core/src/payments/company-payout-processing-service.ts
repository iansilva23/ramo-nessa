import type { FinanceRepository } from './finance-repository.js';
import type {
  DriverPayoutProvider,
  DriverPayoutProviderResult,
} from './driver-payout-provider.js';

function terminal(status: string): boolean {
  return status === 'paid' || status === 'failed' || status === 'cancelled';
}

async function applyProviderResult(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  payoutId: string;
  result: DriverPayoutProviderResult;
}) {
  if (input.result.status === 'paid') {
    const completed = await input.finance.completeCompanyPayout({
      payoutId: input.payoutId,
      processor: input.provider.name,
      processorPayoutId: input.result.providerPayoutId,
    });
    return { kind: 'paid' as const, payout: completed.payout };
  }

  if (input.result.status === 'failed') {
    const failed = await input.finance.failCompanyPayout({
      payoutId: input.payoutId,
      processor: input.provider.name,
      processorPayoutId: input.result.providerPayoutId,
    });
    return { kind: 'failed' as const, payout: failed.payout };
  }

  const started = await input.finance.startCompanyPayout({
    payoutId: input.payoutId,
    processor: input.provider.name,
    processorPayoutId: input.result.providerPayoutId,
  });
  return { kind: 'processing' as const, payout: started.payout };
}

export async function processCompanyPayout(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  payoutId: string;
}) {
  const payout = await input.finance.findCompanyPayoutById(input.payoutId);
  if (payout == null) {
    return { kind: 'missing' as const, payout: null };
  }
  if (terminal(payout.status)) {
    return { kind: 'terminal' as const, payout };
  }

  if (payout.status === 'processing') {
    if (!payout.processorPayoutId) {
      const failed = await input.finance.failCompanyPayout({
        payoutId: payout.id,
        processor: input.provider.name,
      });
      return { kind: 'failed' as const, payout: failed.payout };
    }
    const result = await input.provider.getPayoutStatus(
      payout.processorPayoutId,
    );
    return applyProviderResult({
      finance: input.finance,
      provider: input.provider,
      payoutId: payout.id,
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
    finance: input.finance,
    provider: input.provider,
    payoutId: payout.id,
    result,
  });
}

export async function reconcileCompanyPayouts(input: {
  finance: FinanceRepository;
  provider: DriverPayoutProvider;
  limit?: number;
}) {
  const payouts = await input.finance.listCompanyPayoutsByStatus(
    ['requested', 'processing'],
    input.limit ?? 100,
  );

  let processed = 0;
  let paid = 0;
  let failed = 0;
  let processing = 0;
  let errors = 0;

  for (const payout of payouts) {
    try {
      const result = await processCompanyPayout({
        finance: input.finance,
        provider: input.provider,
        payoutId: payout.id,
      });
      processed += 1;
      if (result.kind === 'paid') paid += 1;
      if (result.kind === 'failed') failed += 1;
      if (result.kind === 'processing') processing += 1;
    } catch {
      errors += 1;
    }
  }

  return { processed, paid, failed, processing, errors };
}
