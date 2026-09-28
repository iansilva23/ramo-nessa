import type { WalletTopupMethod } from './wallet.js';

export class InvalidWalletRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWalletRequestError';
  }
}

export interface CreateWalletTopupRequest {
  method: WalletTopupMethod;
  amountCents: number;
  payerEmail?: string;
  cardToken?: string;
  paymentMethodId?: string;
  paymentMethodType?: 'credit_card' | 'debit_card';
  installments?: number;
}

function parseEmail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new InvalidWalletRequestError(
      'payerEmail deve ser um e-mail válido.',
    );
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 5 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new InvalidWalletRequestError(
      'Informe um e-mail válido para recarregar a carteira.',
    );
  }
  return normalized;
}

export function parseCreateWalletTopupRequest(
  input: unknown,
): CreateWalletTopupRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidWalletRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  const method = record.method;
  const amountCents = record.amountCents;

  if (method !== 'pix' && method !== 'card') {
    throw new InvalidWalletRequestError(
      'method da recarga deve ser pix ou card.',
    );
  }

  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < 100 ||
    amountCents > 1_000_000
  ) {
    throw new InvalidWalletRequestError(
      'amountCents deve ser inteiro entre 100 e 1000000.',
    );
  }

  const payerEmail = parseEmail(record.payerEmail);
  let cardToken: string | undefined;
  let paymentMethodId: string | undefined;
  let paymentMethodType: 'credit_card' | 'debit_card' | undefined;
  let installments: number | undefined;

  if (method === 'card') {
    if (payerEmail == null) {
      throw new InvalidWalletRequestError(
        'Informe um e-mail válido para recarregar com cartão.',
      );
    }

    const rawToken = record.cardToken;
    const rawPaymentMethodId = record.paymentMethodId;
    const rawPaymentMethodType = record.paymentMethodType;
    const rawInstallments = record.installments ?? 1;

    if (
      typeof rawToken !== 'string' ||
      rawToken.trim().length < 20 ||
      rawToken.trim().length > 1024
    ) {
      throw new InvalidWalletRequestError(
        'Token seguro do cartão é obrigatório.',
      );
    }
    if (
      typeof rawPaymentMethodId !== 'string' ||
      !/^[A-Za-z0-9_-]{2,40}$/.test(rawPaymentMethodId.trim())
    ) {
      throw new InvalidWalletRequestError(
        'Bandeira do cartão inválida.',
      );
    }
    if (
      rawPaymentMethodType !== 'credit_card' &&
      rawPaymentMethodType !== 'debit_card'
    ) {
      throw new InvalidWalletRequestError(
        'Tipo de cartão inválido.',
      );
    }
    if (
      typeof rawInstallments !== 'number' ||
      !Number.isInteger(rawInstallments) ||
      rawInstallments !== 1
    ) {
      throw new InvalidWalletRequestError(
        'A recarga com cartão é somente à vista.',
      );
    }

    cardToken = rawToken.trim();
    paymentMethodId = rawPaymentMethodId.trim();
    paymentMethodType = rawPaymentMethodType;
    installments = rawInstallments;
  }

  return {
    method,
    amountCents,
    ...(payerEmail == null ? {} : { payerEmail }),
    ...(cardToken == null ? {} : { cardToken }),
    ...(paymentMethodId == null ? {} : { paymentMethodId }),
    ...(paymentMethodType == null ? {} : { paymentMethodType }),
    ...(installments == null ? {} : { installments }),
  };
}
