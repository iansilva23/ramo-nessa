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
    amountCents <= 0
  ) {
    throw new InvalidWalletRequestError(
      'amountCents deve ser inteiro positivo.',
    );
  }

  return { method, amountCents };
}
