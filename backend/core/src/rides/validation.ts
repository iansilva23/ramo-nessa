import type { QuoteRequest } from '../pricing/types.js';
import { parseQuoteRequest } from '../pricing/validation.js';

export class InvalidRideRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRideRequestError';
  }
}

export interface CreateRideRequest {
  quoteRequest: QuoteRequest;
}

export function parseCreateRideRequest(input: unknown): CreateRideRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidRideRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  if (record.quoteRequest == null) {
    throw new InvalidRideRequestError('quoteRequest é obrigatório.');
  }

  return {
    quoteRequest: parseQuoteRequest(record.quoteRequest),
  };
}
