import type { FinanceRepository } from './finance-repository.js';
import { PAYMENT_POLICY_V1 } from './payment-policy.js';
import type { PaymentPolicySettingsRepository } from './payment-policy-settings-repository.js';

export interface DriverCashPolicySnapshot {
  cashEnabled: boolean;
  defaultDebtLimitCents: number;
  overrideDebtLimitCents: number | null;
  effectiveDebtLimitCents: number;
  currentDebtCents: number;
  remainingDebtCapacityCents: number;
  canAcceptCashRide: boolean;
  updatedAt: string;
}

export async function driverCashPolicySnapshot(input: {
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  driverId: string;
}): Promise<DriverCashPolicySnapshot> {
  const [settings, override, currentDebtCents] = await Promise.all([
    input.settings.get(),
    input.settings.getDriverCashDebtLimitOverride(input.driverId),
    input.finance.getDriverCashDebtCents(input.driverId),
  ]);

  const defaultDebtLimitCents =
    PAYMENT_POLICY_V1.futureCashDebtLimitCents;
  const overrideDebtLimitCents =
    override?.debtLimitCents ?? null;
  const effectiveDebtLimitCents = Math.max(
    defaultDebtLimitCents,
    overrideDebtLimitCents ?? defaultDebtLimitCents,
  );
  const remainingDebtCapacityCents = Math.max(
    0,
    effectiveDebtLimitCents - currentDebtCents,
  );

  return {
    cashEnabled: settings.cashEnabled,
    defaultDebtLimitCents,
    overrideDebtLimitCents,
    effectiveDebtLimitCents,
    currentDebtCents,
    remainingDebtCapacityCents,
    canAcceptCashRide:
      settings.cashEnabled && currentDebtCents < effectiveDebtLimitCents,
    updatedAt: override?.updatedAt ?? settings.updatedAt,
  };
}

export async function canDriverAcceptCashRide(input: {
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  driverId: string;
  additionalCommissionCents: number;
}): Promise<boolean> {
  const snapshot = await driverCashPolicySnapshot(input);
  if (!snapshot.cashEnabled) return false;
  return (
    snapshot.currentDebtCents + input.additionalCommissionCents <=
    snapshot.effectiveDebtLimitCents
  );
}

export async function assertDriverCashCapacity(input: {
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  driverId: string;
  additionalCommissionCents: number;
}) {
  const snapshot = await driverCashPolicySnapshot(input);

  if (!snapshot.cashEnabled) {
    throw new DriverCashPolicyError(
      'CASH_DISABLED',
      'Pagamento em dinheiro está desativado.',
    );
  }

  const projectedDebtCents =
    snapshot.currentDebtCents + input.additionalCommissionCents;
  if (projectedDebtCents > snapshot.effectiveDebtLimitCents) {
    throw new DriverCashPolicyError(
      'CASH_DEBT_LIMIT_EXCEEDED',
      'A comissão projetada ultrapassa o limite cash do motorista.',
    );
  }

  return {
    ...snapshot,
    projectedDebtCents,
  };
}

export class DriverCashPolicyError extends Error {
  constructor(
    public readonly code:
      | 'CASH_DISABLED'
      | 'CASH_DEBT_LIMIT_EXCEEDED',
    message: string,
  ) {
    super(message);
    this.name = 'DriverCashPolicyError';
  }
}
