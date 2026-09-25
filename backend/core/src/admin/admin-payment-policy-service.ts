import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import { PAYMENT_POLICY_V1 } from '../payments/payment-policy.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import {
  MAX_CARD_PRICE_ADJUSTMENT_BPS,
} from '../payments/card-price-adjustment.js';

export class AdminPaymentPolicyError extends Error {
  constructor(
    public readonly code:
      | 'CASH_ACTIVATION_BLOCKED'
      | 'INVALID_CARD_PRICE_ADJUSTMENT',
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
    cardPriceAdjustmentBps: settings.cardPriceAdjustmentBps,
    cashActivationReady: true,
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
  cashEnabled?: boolean;
  cardPriceAdjustmentBps?: number;
  now?: Date;
}) {
  if (
    input.cardPriceAdjustmentBps != null &&
    (!Number.isInteger(input.cardPriceAdjustmentBps) ||
      input.cardPriceAdjustmentBps < 0 ||
      input.cardPriceAdjustmentBps > MAX_CARD_PRICE_ADJUSTMENT_BPS)
  ) {
    throw new AdminPaymentPolicyError(
      'INVALID_CARD_PRICE_ADJUSTMENT',
      `O ajuste do preço no cartão deve ficar entre 0 e ${MAX_CARD_PRICE_ADJUSTMENT_BPS / 100}%.`,
    );
  }

  const current = await input.repository.get();
  const nextCashEnabled = input.cashEnabled ?? current.cashEnabled;
  const nextCardPriceAdjustmentBps =
    input.cardPriceAdjustmentBps ?? current.cardPriceAdjustmentBps;

  if (
    current.cashEnabled === nextCashEnabled &&
    current.cardPriceAdjustmentBps === nextCardPriceAdjustmentBps
  ) {
    return adminPaymentPolicyView(input.repository);
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  if (current.cashEnabled !== nextCashEnabled) {
    await input.repository.setCashEnabled(nextCashEnabled, updatedAt);
  }
  if (current.cardPriceAdjustmentBps !== nextCardPriceAdjustmentBps) {
    await input.repository.setCardPriceAdjustmentBps(
      nextCardPriceAdjustmentBps,
      updatedAt,
    );
  }

  const cashChanged = current.cashEnabled !== nextCashEnabled;
  const cardChanged =
    current.cardPriceAdjustmentBps !== nextCardPriceAdjustmentBps;
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action:
      cashChanged && !cardChanged
        ? nextCashEnabled
          ? 'payment_policy.cash_enabled'
          : 'payment_policy.cash_disabled'
        : cardChanged && !cashChanged
          ? 'payment_policy.card_price_adjustment_updated'
          : 'payment_policy.updated',
    targetType: 'payment_policy',
    targetId: cardChanged && !cashChanged ? 'card' : 'payments',
    metadata: {
      previousCashEnabled: current.cashEnabled,
      cashEnabled: nextCashEnabled,
      previousCardPriceAdjustmentBps:
        current.cardPriceAdjustmentBps,
      cardPriceAdjustmentBps: nextCardPriceAdjustmentBps,
    },
    createdAt: updatedAt,
  });

  return adminPaymentPolicyView(input.repository);
}
