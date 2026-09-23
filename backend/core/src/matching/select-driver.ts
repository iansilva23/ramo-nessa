import type { DriverSupplyRecord } from '../drivers/driver-supply.js';
import type { RideRecord } from '../rides/ride.js';
import { beginDriverSearch } from '../rides/ride-state.js';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RankedDriver {
  supply: DriverSupplyRecord;
  approximatePickupDistanceKm: number;
  /**
   * A distância em linha reta é apenas para ranking.
   * A cotação final de coleta distante exige distância roteada.
   */
  routeDistanceRequiredForFinalFare: true;
}

export class MatchingError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PICKUP'
      | 'RIDE_NOT_READY'
      | 'NO_ELIGIBLE_DRIVER',
    message: string,
  ) {
    super(message);
    this.name = 'MatchingError';
  }
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  ) {
    throw new MatchingError('INVALID_PICKUP', 'Coordenadas inválidas.');
  }

  const earthRadiusKm = 6371;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function rideRequiresFourByFour(ride: RideRecord): boolean {
  const originIsJeri = ride.origin.zoneId === 'jericoacoara';
  const destinationIsJeri = ride.destination.zoneId === 'jericoacoara';

  return (
    ride.category === 'comfort_black' &&
    originIsJeri !== destinationIsJeri
  );
}

export function rankEligibleDrivers(input: {
  ride: RideRecord;
  pickup: GeoPoint;
  candidates: readonly DriverSupplyRecord[];
  now?: Date;
  maxLocationAgeSeconds?: number;
}): RankedDriver[] {
  const now = input.now ?? new Date();
  const maxAgeMs = (input.maxLocationAgeSeconds ?? 120) * 1000;
  const requiresFourByFour = rideRequiresFourByFour(input.ride);

  return input.candidates
    .filter((candidate) => {
      if (!candidate.online || candidate.busy) return false;
      if (!candidate.categories.includes(input.ride.category)) return false;
      if (candidate.seatCapacity < input.ride.passengers) return false;
      if (requiresFourByFour && !candidate.fourByFour) return false;

      const updatedAt = Date.parse(candidate.locationUpdatedAt);
      if (Number.isNaN(updatedAt)) return false;
      const ageMs = now.getTime() - updatedAt;
      if (ageMs < 0 || ageMs > maxAgeMs) return false;

      return true;
    })
    .map((supply) => ({
      supply,
      approximatePickupDistanceKm: distanceKm(
        {
          latitude: supply.latitude,
          longitude: supply.longitude,
        },
        input.pickup,
      ),
      routeDistanceRequiredForFinalFare: true as const,
    }))
    .sort(
      (a, b) =>
        a.approximatePickupDistanceKm -
        b.approximatePickupDistanceKm,
    );
}

export function selectDriverForDispatch(input: {
  ride: RideRecord;
  pickup: GeoPoint;
  candidates: readonly DriverSupplyRecord[];
  now?: Date;
  maxLocationAgeSeconds?: number;
}): {
  nextRideState: 'SEARCHING_DRIVER';
  driver: RankedDriver;
} {
  if (input.ride.state !== 'PAID') {
    throw new MatchingError(
      'RIDE_NOT_READY',
      'Matching só pode iniciar depois da corrida estar PAID.',
    );
  }

  const ranked = rankEligibleDrivers(input);
  const driver = ranked[0];

  if (driver == null) {
    throw new MatchingError(
      'NO_ELIGIBLE_DRIVER',
      'Nenhum motorista elegível disponível.',
    );
  }

  const nextRideState = beginDriverSearch(input.ride.state, {
    status: input.ride.paymentStatus,
    amountCents: input.ride.quote.totalAmountCents,
  });

  if (nextRideState !== 'SEARCHING_DRIVER') {
    throw new MatchingError(
      'RIDE_NOT_READY',
      'Máquina de estados não entrou em SEARCHING_DRIVER.',
    );
  }

  return {
    nextRideState,
    driver,
  };
}
