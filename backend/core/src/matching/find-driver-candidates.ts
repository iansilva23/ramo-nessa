import type { LocationRef, ServiceCategory } from '../pricing/types.js';
import type {
  DriverAvailability,
  DriverPosition,
} from './driver-availability.js';
import type { DriverAvailabilityRepository } from './driver-availability-repository.js';

export const DEFAULT_DRIVER_FRESHNESS_MS = 60_000;

export interface DriverCandidate {
  driver: DriverAvailability;
  straightLineDistanceKm: number;
  routeDistanceRequiredForFinalFare: true;
}

export interface FindDriverCandidatesInput {
  category: ServiceCategory;
  passengers: number;
  pickup: DriverPosition;
  origin: LocationRef;
  destination: LocationRef;
  now?: Date;
  maxCandidates?: number;
  freshnessMs?: number;
}

export class MatchingError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PICKUP_POSITION'
      | 'INVALID_PASSENGER_COUNT',
    message: string,
  ) {
    super(message);
    this.name = 'MatchingError';
  }
}

function validatePosition(position: DriverPosition): void {
  if (
    !Number.isFinite(position.lat) ||
    position.lat < -90 ||
    position.lat > 90 ||
    !Number.isFinite(position.lon) ||
    position.lon < -180 ||
    position.lon > 180
  ) {
    throw new MatchingError(
      'INVALID_PICKUP_POSITION',
      'Posição de embarque inválida.',
    );
  }
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function straightLineDistanceKm(
  a: DriverPosition,
  b: DriverPosition,
): number {
  const earthRadiusKm = 6371;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const deltaLat = radians(b.lat - a.lat);
  const deltaLon = radians(b.lon - a.lon);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function routeRequiresJeri4x4(
  origin: LocationRef,
  destination: LocationRef,
): boolean {
  const originIsJeri = origin.zoneId === 'jericoacoara';
  const destinationIsJeri = destination.zoneId === 'jericoacoara';

  return originIsJeri !== destinationIsJeri;
}

export async function findDriverCandidates(
  repository: DriverAvailabilityRepository,
  input: FindDriverCandidatesInput,
): Promise<DriverCandidate[]> {
  validatePosition(input.pickup);

  if (
    !Number.isInteger(input.passengers) ||
    input.passengers < 1 ||
    input.passengers > 12
  ) {
    throw new MatchingError(
      'INVALID_PASSENGER_COUNT',
      'Quantidade de passageiros inválida.',
    );
  }

  const now = input.now ?? new Date();
  const freshnessMs =
    input.freshnessMs ?? DEFAULT_DRIVER_FRESHNESS_MS;
  const freshAfter = new Date(now.getTime() - freshnessMs);
  const needs4x4 =
    input.category === 'comfort_black' &&
    routeRequiresJeri4x4(input.origin, input.destination);

  const drivers = await repository.listAvailable({
    category: input.category,
    freshAfter,
  });

  return drivers
    .filter(
      (driver) =>
        driver.passengerCapacity >= input.passengers &&
        (!needs4x4 || driver.jeri4x4Eligible),
    )
    .map((driver) => ({
      driver,
      straightLineDistanceKm: straightLineDistanceKm(
        driver.position,
        input.pickup,
      ),
      // Linha reta serve apenas para ranking. O preço final usa distância
      // roteada motorista -> passageiro para a compensação de combustível.
      routeDistanceRequiredForFinalFare: true as const,
    }))
    .sort(
      (a, b) =>
        a.straightLineDistanceKm - b.straightLineDistanceKm ||
        a.driver.driverId.localeCompare(b.driver.driverId),
    )
    .slice(0, Math.max(1, input.maxCandidates ?? 10));
}
