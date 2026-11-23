import { anticipationPolicy } from '../payments/payout.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';

function safeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

export async function adminFinanceView(input: {
  finance: FinanceRepository;
  registry?: DriverRegistryRepository;
  limit?: number;
  canManageCompanyPayouts?: boolean;
  payoutProviderConfigured?: boolean;
  asaasIntegration?: { provider: 'asaas'; status: string; apiAvailable: boolean; environment: string | null };
  companyPayoutProviderConfigured?: boolean;
}) {
  const limit = safeLimit(input.limit);
  const [
    summary,
    payments,
    payouts,
    payoutSettings,
    payoutCandidates,
    companyDestination,
    companyPayouts,
    externalAdjustments,
  ] = await Promise.all([
    input.finance.adminFinanceSummary(),
    input.finance.listRecentPayments(limit),
    input.finance.listRecentDriverPayouts(limit),
    input.finance.getDriverPayoutSettings(),
    input.finance.listDriverPayoutCandidates(500),
    input.finance.getCompanyPayoutDestination(),
    input.finance.listRecentCompanyPayouts(limit),
    input.finance.listRecentExternalPaymentAdjustments(limit),
  ]);

  const names = new Map(await Promise.all([...new Set([...payouts, ...payoutCandidates].map(item => item.driverId))].map(async id => [id, (await input.registry?.findProfile(id))?.fullName ?? null] as const)));

  return {
    readOnly: false,
    paymentsReadOnly: true,
    payoutManagementEnabled: true,
    payoutReconciliation: {
      canManage: input.canManageCompanyPayouts === true,
      providerConfigured: input.payoutProviderConfigured === true,
    },
    generatedAt: new Date().toISOString(),
    summary,
    payoutPolicy: {
      automaticEnabled: payoutSettings.automaticEnabled,
      mode: payoutSettings.mode ?? (payoutSettings.automaticEnabled ? 'automatic' : 'manual'),
      apiAvailable: input.payoutProviderConfigured === true,
      asaas: input.asaasIntegration ?? { provider: 'asaas', status: 'awaiting_configuration', apiAvailable: false },
      updatedAt: payoutSettings.updatedAt,
      scheduleDays: ['monday', 'wednesday', 'friday'],
      scheduleHour: 7,
      timeZone: 'America/Fortaleza',
      ...anticipationPolicy(payoutSettings),
    },
    payoutCandidates: payoutCandidates.map((candidate) => ({
      driverId: candidate.driverId,
      driverName: names.get(candidate.driverId) ?? null,
      availableBalanceCents: candidate.availableBalanceCents,
      pixConfigured: candidate.destination != null,
      pixKeyType: candidate.destination?.pixKeyType ?? null,
      pixKeyMasked:
        candidate.destination == null
          ? null
          : `••••${candidate.destination.pixKey.slice(-4)}`,
    })),
    companyPayout: {
      canManage: input.canManageCompanyPayouts === true,
      apiAvailable: input.companyPayoutProviderConfigured ?? input.payoutProviderConfigured ?? false,
      destinationConfigured: companyDestination != null,
      pixKeyType: companyDestination?.pixKeyType ?? null,
      pixKeyMasked:
        companyDestination == null
          ? null
          : `••••${companyDestination.pixKey.slice(-4)}`,
      destinationUpdatedAt: companyDestination?.updatedAt ?? null,
      availableCents: summary.companyProfitAvailableCents,
      pendingCents: summary.companyPayoutPendingCents,
      accountingRevenueCents: summary.platformRevenueCents,
      unrecoveredCashCommissionCents:
        summary.driverCashCommissionDebtCents,
      note:
        'Saldo disponível considera a receita da plataforma menos comissão cash ainda não recuperada e ajustes externos em revisão. Não representa lucro contábil após impostos/despesas.',
    },
    externalAdjustments: externalAdjustments.map((adjustment) => ({
      id: adjustment.id,
      paymentId: adjustment.paymentId,
      kind: adjustment.kind,
      processorAdjustmentId: adjustment.processorAdjustmentId,
      processorStatus: adjustment.processorStatus,
      processorStatusDetail: adjustment.processorStatusDetail,
      amountCents: adjustment.amountCents,
      escrowAppliedCents: adjustment.escrowAppliedCents,
      reviewRequiredCents: adjustment.reviewRequiredCents,
      accountingStatus: adjustment.accountingStatus,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    })),
    companyPayouts: companyPayouts.map((payout) => ({
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
      driverName: names.get(payout.driverId) ?? null,
      amountCents: payout.amountCents,
      requestedAmountCents: payout.requestedAmountCents ?? payout.amountCents,
      feeCents: payout.feeCents ?? 0,
      payoutKind: payout.payoutKind ?? 'legacy',
      executionMode: payout.executionMode ?? 'api',
      approvedAt: payout.approvedAt ?? null,
      status: payout.status,
      processor: payout.processor ?? null,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    })),
  };
}
