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

export interface PrepareRideRequest {
  quoteRequest: QuoteRequest;
  pickup: {
    latitude: number;
    longitude: number;
  };
}

export function parsePrepareRideRequest(input: unknown): PrepareRideRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidRideRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  if (record.quoteRequest == null) {
    throw new InvalidRideRequestError('quoteRequest é obrigatório.');
  }
  if (
    record.pickup == null ||
    typeof record.pickup !== 'object' ||
    Array.isArray(record.pickup)
  ) {
    throw new InvalidRideRequestError('pickup deve ser um objeto.');
  }

  const pickup = record.pickup as Record<string, unknown>;
  const latitude = pickup.latitude;
  const longitude = pickup.longitude;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new InvalidRideRequestError('pickup possui coordenadas inválidas.');
  }

  return {
    quoteRequest: parseQuoteRequest(record.quoteRequest),
    pickup: { latitude, longitude },
  };
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
