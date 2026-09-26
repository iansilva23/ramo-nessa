import type { FinanceRepository } from '../payments/finance-repository.js';

function safeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

export async function adminFinanceView(input: {
  finance: FinanceRepository;
  limit?: number;
}) {
  const limit = safeLimit(input.limit);
  const [summary, payments, payouts] = await Promise.all([
    input.finance.adminFinanceSummary(),
    input.finance.listRecentPayments(limit),
    input.finance.listRecentDriverPayouts(limit),
  ]);

  return {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    summary,
    payments: payments.map((payment) => ({
      id: payment.id,
      rideId: payment.rideId,
      method: payment.method,
      processor: payment.processor,
      status: payment.status,
      amountCents: payment.amountCents,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      driverId: payout.driverId,
      amountCents: payout.amountCents,
      status: payout.status,
      processor: payout.processor ?? null,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    })),
  };
}
