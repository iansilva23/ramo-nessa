import {
  isPaymentMethodEnabled,
  type RidePaymentMethod,
} from './payment-policy.js';

export class InvalidPaymentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentRequestError';
  }
}

export interface CreatePaymentRequest {
  method: RidePaymentMethod;
  payerEmail?: string;
  cardToken?: string;
  paymentMethodId?: string;
  paymentMethodType?: 'credit_card' | 'debit_card';
  installments?: number;
}

export function parseCreatePaymentRequest(input: unknown): CreatePaymentRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidPaymentRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  const method = record.method;

  if (
    typeof method !== 'string' ||
    (method !== 'cash' && !isPaymentMethodEnabled(method))
  ) {
    throw new InvalidPaymentRequestError(
      'method deve ser pix, card, wallet ou cash.',
    );
  }

  const rawEmail = record.payerEmail;
  let payerEmail: string | undefined;
  if (rawEmail != null) {
    if (typeof rawEmail !== 'string') {
      throw new InvalidPaymentRequestError(
        'payerEmail deve ser um e-mail válido.',
      );
    }
    const normalized = rawEmail.trim().toLowerCase();
    if (
      normalized.length < 5 ||
      normalized.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw new InvalidPaymentRequestError(
        'Informe um e-mail válido para continuar o pagamento.',
      );
    }
    payerEmail = normalized;
  }

  let cardToken: string | undefined;
  let paymentMethodId: string | undefined;
  let paymentMethodType: 'credit_card' | 'debit_card' | undefined;
  let installments: number | undefined;

  if (method === 'card') {
    if (payerEmail == null) {
      throw new InvalidPaymentRequestError(
        'Informe um e-mail válido para continuar o pagamento.',
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
      throw new InvalidPaymentRequestError(
        'Token seguro do cartão é obrigatório.',
      );
    }

    if (
      typeof rawPaymentMethodId !== 'string' ||
      !/^[A-Za-z0-9_-]{2,40}$/.test(rawPaymentMethodId.trim())
    ) {
      throw new InvalidPaymentRequestError(
        'Bandeira do cartão inválida.',
      );
    }

    if (
      rawPaymentMethodType !== 'credit_card' &&
      rawPaymentMethodType !== 'debit_card'
    ) {
      throw new InvalidPaymentRequestError(
        'Tipo de cartão inválido.',
      );
    }

    if (
      typeof rawInstallments !== 'number' ||
      !Number.isInteger(rawInstallments) ||
      rawInstallments !== 1
    ) {
      throw new InvalidPaymentRequestError(
        'O Ramo Nessa aceita pagamento com cartão somente à vista.',
      );
    }

    cardToken = rawToken.trim();
    paymentMethodId = rawPaymentMethodId.trim();
    paymentMethodType = rawPaymentMethodType;
    installments = rawInstallments;
  }

  return {
    method,
    ...(payerEmail == null ? {} : { payerEmail }),
    ...(cardToken == null ? {} : { cardToken }),
    ...(paymentMethodId == null ? {} : { paymentMethodId }),
    ...(paymentMethodType == null ? {} : { paymentMethodType }),
    ...(installments == null ? {} : { installments }),
  };
}

export function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw = headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (value == null || value.trim().length < 8) {
    throw new InvalidPaymentRequestError(
      'Header Idempotency-Key é obrigatório e deve ter pelo menos 8 caracteres.',
    );
  }

  return value.trim();
}
