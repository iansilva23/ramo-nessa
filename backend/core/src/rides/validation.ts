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
  dropoff: {
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
  const parsePoint = (
    value: unknown,
    field: 'pickup' | 'dropoff',
  ): { latitude: number; longitude: number } => {
    if (
      value == null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new InvalidRideRequestError(
        `${field} deve ser um objeto.`,
      );
    }

    const point = value as Record<string, unknown>;
    const latitude = point.latitude;
    const longitude = point.longitude;

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
      throw new InvalidRideRequestError(
        `${field} possui coordenadas inválidas.`,
      );
    }

    return { latitude, longitude };
  };

  return {
    quoteRequest: parseQuoteRequest(record.quoteRequest),
    pickup: parsePoint(record.pickup, 'pickup'),
    dropoff: parsePoint(record.dropoff, 'dropoff'),
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
