import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import { PAYMENT_POLICY_V1 } from '../payments/payment-policy.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';

export class AdminPaymentPolicyError extends Error {
  constructor(
    public readonly code:
      | 'CASH_ACTIVATION_BLOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'AdminPaymentPolicyError';
  }
}

export async function adminPaymentPolicyView(
  repository: PaymentPolicySettingsRepository,
) {
  const settings = await repository.get();
  return {
    cashEnabled: settings.cashEnabled,
    cashActivationReady: false,
    futureCashDebtLimitCents:
      PAYMENT_POLICY_V1.futureCashDebtLimitCents,
    directDriverPixEnabled:
      PAYMENT_POLICY_V1.directDriverPixEnabled,
    paymentRequiredBeforeDispatch:
      PAYMENT_POLICY_V1.paymentRequiredBeforeDispatch,
    passengerWalletEnabled:
      PAYMENT_POLICY_V1.passengerWalletEnabled,
    allowedDigitalMethods: [...PAYMENT_POLICY_V1.allowedMethods],
    updatedAt: settings.updatedAt,
  };
}

export async function updateAdminPaymentPolicy(input: {
  repository: PaymentPolicySettingsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  cashEnabled: boolean;
  now?: Date;
}) {
  if (input.cashEnabled) {
    throw new AdminPaymentPolicyError(
      'CASH_ACTIVATION_BLOCKED',
      'Dinheiro só poderá ser ativado depois do fluxo cash de comissão, dívida e limite operacional estar implementado.',
    );
  }

  const current = await input.repository.get();
  if (current.cashEnabled === false) {
    return adminPaymentPolicyView(input.repository);
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  await input.repository.setCashEnabled(false, updatedAt);
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'payment_policy.cash_disabled',
    targetType: 'payment_policy',
    targetId: 'cash',
    metadata: {
      cashEnabled: false,
    },
    createdAt: updatedAt,
  });

  return adminPaymentPolicyView(input.repository);
}
