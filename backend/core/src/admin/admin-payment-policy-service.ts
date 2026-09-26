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
import {
  MAX_PIX_PRICE_ADJUSTMENT_BPS,
} from '../payments/pix-price-adjustment.js';

export class AdminPaymentPolicyError extends Error {
  constructor(
    public readonly code:
      | 'CASH_ACTIVATION_BLOCKED'
      | 'INVALID_PIX_PRICE_ADJUSTMENT'
      | 'INVALID_CARD_PRICE_ADJUSTMENT'
      | 'INVALID_DEFAULT_CASH_DEBT_LIMIT',
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
    pixPriceAdjustmentBps: settings.pixPriceAdjustmentBps,
    cardPriceAdjustmentBps: settings.cardPriceAdjustmentBps,
    cashActivationReady: true,
    futureCashDebtLimitCents:
      settings.defaultCashDebtLimitCents,
    directDriverPixEnabled:
      PAYMENT_POLICY_V1.directDriverPixEnabled,
    paymentRequiredBeforeDispatch:
      PAYMENT_POLICY_V1.paymentRequiredBeforeDispatch,
    passengerWalletEnabled: settings.walletEnabled,
    pixEnabled: settings.pixEnabled,
    cardEnabled: settings.cardEnabled,
    walletEnabled: settings.walletEnabled,
    allowedDigitalMethods: [
      ...(settings.pixEnabled ? ['pix'] : []),
      ...(settings.cardEnabled ? ['card'] : []),
      ...(settings.walletEnabled ? ['wallet'] : []),
    ],
    updatedAt: settings.updatedAt,
  };
}

export async function updateAdminPaymentPolicy(input: {
  repository: PaymentPolicySettingsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  cashEnabled?: boolean;
  pixEnabled?: boolean;
  cardEnabled?: boolean;
  walletEnabled?: boolean;
  defaultCashDebtLimitCents?: number;
  pixPriceAdjustmentBps?: number;
  cardPriceAdjustmentBps?: number;
  now?: Date;
}) {
  if (
    input.pixPriceAdjustmentBps != null &&
    (!Number.isInteger(input.pixPriceAdjustmentBps) ||
      input.pixPriceAdjustmentBps < 0 ||
      input.pixPriceAdjustmentBps > MAX_PIX_PRICE_ADJUSTMENT_BPS)
  ) {
    throw new AdminPaymentPolicyError(
      'INVALID_PIX_PRICE_ADJUSTMENT',
      `O ajuste do preço no Pix deve ficar entre 0 e ${MAX_PIX_PRICE_ADJUSTMENT_BPS / 100}%.`,
    );
  }

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

  if (
    input.defaultCashDebtLimitCents != null &&
    (!Number.isInteger(input.defaultCashDebtLimitCents) ||
      input.defaultCashDebtLimitCents < 0 ||
      input.defaultCashDebtLimitCents > 100_000_000)
  ) {
    throw new AdminPaymentPolicyError(
      'INVALID_DEFAULT_CASH_DEBT_LIMIT',
      'O limite cash padrão deve ficar entre R$ 0,00 e R$ 1.000.000,00.',
    );
  }

  const current = await input.repository.get();
  const nextCashEnabled = input.cashEnabled ?? current.cashEnabled;
  const nextPixEnabled = input.pixEnabled ?? current.pixEnabled;
  const nextCardEnabled = input.cardEnabled ?? current.cardEnabled;
  const nextWalletEnabled = input.walletEnabled ?? current.walletEnabled;
  const nextDefaultCashDebtLimitCents =
    input.defaultCashDebtLimitCents ??
    current.defaultCashDebtLimitCents;
  const nextPixPriceAdjustmentBps =
    input.pixPriceAdjustmentBps ?? current.pixPriceAdjustmentBps;
  const nextCardPriceAdjustmentBps =
    input.cardPriceAdjustmentBps ?? current.cardPriceAdjustmentBps;

  if (
    current.cashEnabled === nextCashEnabled &&
    current.pixEnabled === nextPixEnabled &&
    current.cardEnabled === nextCardEnabled &&
    current.walletEnabled === nextWalletEnabled &&
    current.defaultCashDebtLimitCents ===
      nextDefaultCashDebtLimitCents &&
    current.pixPriceAdjustmentBps === nextPixPriceAdjustmentBps &&
    current.cardPriceAdjustmentBps === nextCardPriceAdjustmentBps
  ) {
    return adminPaymentPolicyView(input.repository);
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  if (current.cashEnabled !== nextCashEnabled) {
    await input.repository.setCashEnabled(nextCashEnabled, updatedAt);
  }
  if (current.pixPriceAdjustmentBps !== nextPixPriceAdjustmentBps) {
    await input.repository.setPixPriceAdjustmentBps(
      nextPixPriceAdjustmentBps,
      updatedAt,
    );
  }
  if (current.cardPriceAdjustmentBps !== nextCardPriceAdjustmentBps) {
    await input.repository.setCardPriceAdjustmentBps(
      nextCardPriceAdjustmentBps,
      updatedAt,
    );
  }
  const digitalMethodsChanged =
    current.pixEnabled !== nextPixEnabled ||
    current.cardEnabled !== nextCardEnabled ||
    current.walletEnabled !== nextWalletEnabled;
  if (digitalMethodsChanged) {
    await input.repository.setDigitalMethods(
      {
        pixEnabled: nextPixEnabled,
        cardEnabled: nextCardEnabled,
        walletEnabled: nextWalletEnabled,
      },
      updatedAt,
    );
  }
  const defaultCashLimitChanged =
    current.defaultCashDebtLimitCents !==
    nextDefaultCashDebtLimitCents;
  if (defaultCashLimitChanged) {
    await input.repository.setDefaultCashDebtLimitCents(
      nextDefaultCashDebtLimitCents,
      updatedAt,
    );
  }

  const cashChanged = current.cashEnabled !== nextCashEnabled;
  const pixChanged =
    current.pixPriceAdjustmentBps !== nextPixPriceAdjustmentBps;
  const cardChanged =
    current.cardPriceAdjustmentBps !== nextCardPriceAdjustmentBps;
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action:
      cashChanged &&
      !pixChanged &&
      !cardChanged &&
      !digitalMethodsChanged &&
      !defaultCashLimitChanged
        ? nextCashEnabled
          ? 'payment_policy.cash_enabled'
          : 'payment_policy.cash_disabled'
        : pixChanged &&
            !cashChanged &&
            !cardChanged &&
            !digitalMethodsChanged &&
            !defaultCashLimitChanged
          ? 'payment_policy.pix_price_adjustment_updated'
          : cardChanged &&
              !cashChanged &&
              !pixChanged &&
              !digitalMethodsChanged &&
              !defaultCashLimitChanged
            ? 'payment_policy.card_price_adjustment_updated'
            : 'payment_policy.updated',
    targetType: 'payment_policy',
    targetId:
      pixChanged &&
      !cashChanged &&
      !cardChanged &&
      !digitalMethodsChanged &&
      !defaultCashLimitChanged
        ? 'pix'
        : cardChanged &&
            !cashChanged &&
            !pixChanged &&
            !digitalMethodsChanged &&
            !defaultCashLimitChanged
          ? 'card'
          : 'payments',
    metadata: {
      previousCashEnabled: current.cashEnabled,
      cashEnabled: nextCashEnabled,
      previousPixEnabled: current.pixEnabled,
      pixEnabled: nextPixEnabled,
      previousCardEnabled: current.cardEnabled,
      cardEnabled: nextCardEnabled,
      previousWalletEnabled: current.walletEnabled,
      walletEnabled: nextWalletEnabled,
      previousDefaultCashDebtLimitCents:
        current.defaultCashDebtLimitCents,
      defaultCashDebtLimitCents:
        nextDefaultCashDebtLimitCents,
      previousPixPriceAdjustmentBps:
        current.pixPriceAdjustmentBps,
      pixPriceAdjustmentBps: nextPixPriceAdjustmentBps,
      previousCardPriceAdjustmentBps:
        current.cardPriceAdjustmentBps,
      cardPriceAdjustmentBps: nextCardPriceAdjustmentBps,
    },
    createdAt: updatedAt,
  });

  return adminPaymentPolicyView(input.repository);
}
