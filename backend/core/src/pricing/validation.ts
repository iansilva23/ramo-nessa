import {
  type LocationRef,
  type PricePeriod,
  type QuoteRequest,
  type ServiceCategory,
  type ZoneId,
} from './types.js';

const ZONES: ReadonlySet<string> = new Set([
  'jericoacoara',
  'jijoca',
  'prea',
  'external',
]);

const CATEGORIES: ReadonlySet<string> = new Set([
  'moto',
  'delivery',
  'car',
  'comfort_black',
  'buggy',
]);

const PERIODS: ReadonlySet<string> = new Set(['day', 'after_22']);

export class InvalidQuoteRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuoteRequestError';
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidQuoteRequestError(`${field} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function parseLocation(value: unknown, field: string): LocationRef {
  const record = asRecord(value, field);
  const zoneId = record.zoneId;

  if (typeof zoneId !== 'string' || !ZONES.has(zoneId)) {
    throw new InvalidQuoteRequestError(`${field}.zoneId inválido.`);
  }

  const localityId = record.localityId;
  if (localityId != null && (typeof localityId !== 'string' || localityId.trim() === '')) {
    throw new InvalidQuoteRequestError(`${field}.localityId inválido.`);
  }

  return {
    zoneId: zoneId as ZoneId,
    ...(typeof localityId === 'string' ? { localityId } : {}),
  };
}

function parseNonNegativeNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new InvalidQuoteRequestError(`${field} deve ser número >= 0.`);
  }
  return value;
}

export function parseQuoteRequest(input: unknown): QuoteRequest {
  const record = asRecord(input, 'body');

  const category = record.category;
  if (typeof category !== 'string' || !CATEGORIES.has(category)) {
    throw new InvalidQuoteRequestError('category inválida.');
  }

  const period = record.period;
  if (typeof period !== 'string' || !PERIODS.has(period)) {
    throw new InvalidQuoteRequestError('period inválido.');
  }

  const passengers = record.passengers;
  if (
    passengers != null &&
    (typeof passengers !== 'number' ||
      !Number.isInteger(passengers) ||
      passengers < 1 ||
      passengers > 4)
  ) {
    throw new InvalidQuoteRequestError(
      'passengers deve ser inteiro entre 1 e 4.',
    );
  }

  const tripDistanceKm = parseNonNegativeNumber(
    record.tripDistanceKm,
    'tripDistanceKm',
  );
  const driverPickupDistanceKm = parseNonNegativeNumber(
    record.driverPickupDistanceKm,
    'driverPickupDistanceKm',
  );

  return {
    origin: parseLocation(record.origin, 'origin'),
    destination: parseLocation(record.destination, 'destination'),
    category: category as ServiceCategory,
    period: period as PricePeriod,
    ...(tripDistanceKm != null ? { tripDistanceKm } : {}),
    ...(typeof passengers === 'number' ? { passengers } : {}),
    ...(driverPickupDistanceKm != null ? { driverPickupDistanceKm } : {}),
  };
}
