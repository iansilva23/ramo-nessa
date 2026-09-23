import {
  isPaymentMethodEnabled,
  type EnabledPaymentMethod,
} from './payment-policy.js';

export class InvalidPaymentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentRequestError';
  }
}

export interface CreatePaymentRequest {
  method: EnabledPaymentMethod;
}

export function parseCreatePaymentRequest(input: unknown): CreatePaymentRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidPaymentRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  const method = record.method;

  if (typeof method !== 'string' || !isPaymentMethodEnabled(method)) {
    throw new InvalidPaymentRequestError(
      'method deve ser pix, card ou wallet.',
    );
  }

  return { method };
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
