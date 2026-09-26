import { randomUUID } from 'node:crypto';

import type { RankedDriver } from './select-driver.js';
import type { RideMatchingRepository } from './ride-matching-repository.js';

export const DEFAULT_DRIVER_OFFER_TTL_SECONDS = 35;

export function createDriverOffer(input: {
  repository: RideMatchingRepository;
  rideId: string;
  driver: RankedDriver;
  now?: Date;
  ttlSeconds?: number;
}) {
  const now = input.now ?? new Date();
  const ttlSeconds =
    input.ttlSeconds ?? DEFAULT_DRIVER_OFFER_TTL_SECONDS;

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 120) {
    throw new Error('ttlSeconds da oferta deve ficar entre 5 e 120.');
  }

  return input.repository.createOffer({
    rideId: input.rideId,
    driverId: input.driver.supply.driverId,
    approximatePickupDistanceKm:
      input.driver.approximatePickupDistanceKm,
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + ttlSeconds * 1000,
    ).toISOString(),
  });
}

export function rejectDriverOffer(input: {
  repository: RideMatchingRepository;
  offerId: string;
  driverId: string;
  now?: Date;
}) {
  return input.repository.rejectOffer({
    offerId: input.offerId,
    driverId: input.driverId,
    rejectedAt: (input.now ?? new Date()).toISOString(),
  });
}

export function acceptDriverOffer(input: {
  repository: RideMatchingRepository;
  offerId: string;
  driverId: string;
  now?: Date;
}) {
  return input.repository.acceptOffer({
    offerId: input.offerId,
    driverId: input.driverId,
    acceptedAt: (input.now ?? new Date()).toISOString(),
  });
}

export function newRideOfferId(): string {
  return randomUUID();
}
