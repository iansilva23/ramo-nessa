import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import { PAYMENT_POLICY_V1 } from '../payments/payment-policy.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { driverCashPolicySnapshot } from '../payments/cash-policy.js';

export class AdminDriverCashPolicyError extends Error {
  constructor(
    public readonly code:
      | 'CASH_NOT_ENABLED'
      | 'DRIVER_CASH_LIMIT_BELOW_DEFAULT'
      | 'INVALID_DRIVER_CASH_LIMIT',
    message: string,
  ) {
    super(message);
    this.name = 'AdminDriverCashPolicyError';
  }
}

export async function adminDriverCashPolicyView(input: {
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  driverId: string;
}) {
  return driverCashPolicySnapshot(input);
}

export async function setAdminDriverCashDebtLimit(input: {
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  debtLimitCents: number | null;
  now?: Date;
}) {
  const currentSettings = await input.settings.get();
  if (!currentSettings.cashEnabled) {
    throw new AdminDriverCashPolicyError(
      'CASH_NOT_ENABLED',
      'O limite individual só pode ser alterado quando dinheiro estiver ativado.',
    );
  }

  const defaultLimit =
    PAYMENT_POLICY_V1.futureCashDebtLimitCents;
  if (
    input.debtLimitCents != null &&
    (!Number.isInteger(input.debtLimitCents) ||
      input.debtLimitCents <= 0)
  ) {
    throw new AdminDriverCashPolicyError(
      'INVALID_DRIVER_CASH_LIMIT',
      'O limite cash individual deve ser um inteiro positivo em centavos.',
    );
  }
  if (
    input.debtLimitCents != null &&
    input.debtLimitCents < defaultLimit
  ) {
    throw new AdminDriverCashPolicyError(
      'DRIVER_CASH_LIMIT_BELOW_DEFAULT',
      'O limite individual só pode aumentar o limite padrão.',
    );
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  if (input.debtLimitCents == null) {
    await input.settings.clearDriverCashDebtLimitOverride(
      input.driverId,
    );
  } else {
    await input.settings.setDriverCashDebtLimitOverride(
      input.driverId,
      input.debtLimitCents,
      updatedAt,
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action:
      input.debtLimitCents == null
        ? 'payment_policy.driver_cash_limit_reset'
        : 'payment_policy.driver_cash_limit_updated',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      defaultDebtLimitCents: defaultLimit,
      overrideDebtLimitCents: input.debtLimitCents,
    },
    createdAt: updatedAt,
  });

  return adminDriverCashPolicyView({
    settings: input.settings,
    finance: input.finance,
    driverId: input.driverId,
  });
}
