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
  const [summary, payments, payouts, payoutSettings, payoutCandidates] =
    await Promise.all([
      input.finance.adminFinanceSummary(),
      input.finance.listRecentPayments(limit),
      input.finance.listRecentDriverPayouts(limit),
      input.finance.getDriverPayoutSettings(),
      input.finance.listDriverPayoutCandidates(500),
    ]);

  return {
    readOnly: false,
    paymentsReadOnly: true,
    payoutManagementEnabled: true,
    generatedAt: new Date().toISOString(),
    summary,
    payoutPolicy: {
      automaticEnabled: payoutSettings.automaticEnabled,
      updatedAt: payoutSettings.updatedAt,
      scheduleDays: ['monday', 'wednesday', 'friday'],
      scheduleHour: 7,
      timeZone: 'America/Fortaleza',
      anticipationMinimumCents: 8000,
      anticipationFeeCents: 1000,
    },
    payoutCandidates: payoutCandidates.map((candidate) => ({
      driverId: candidate.driverId,
      availableBalanceCents: candidate.availableBalanceCents,
      pixConfigured: candidate.destination != null,
      pixKeyType: candidate.destination?.pixKeyType ?? null,
      pixKeyMasked:
        candidate.destination == null
          ? null
          : `••••${candidate.destination.pixKey.slice(-4)}`,
    })),
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
      requestedAmountCents: payout.requestedAmountCents ?? payout.amountCents,
      feeCents: payout.feeCents ?? 0,
      payoutKind: payout.payoutKind ?? 'legacy',
      approvedAt: payout.approvedAt ?? null,
      status: payout.status,
      processor: payout.processor ?? null,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    })),
  };
}
