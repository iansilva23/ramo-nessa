import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import {
  createDriverOffer,
  DEFAULT_DRIVER_OFFER_TTL_SECONDS,
} from './offer-service.js';
import type { GeoPoint } from './select-driver.js';
import { rankEligibleDrivers } from './select-driver.js';
import type { RideMatchingRepository } from './ride-matching-repository.js';
import type { RideOfferRecord } from './ride-offer.js';

export type DispatchNextResult =
  | {
      kind: 'OFFER_ACTIVE';
      offer: RideOfferRecord;
    }
  | {
      kind: 'OFFER_CREATED';
      offer: RideOfferRecord;
    }
  | {
      kind: 'NO_DRIVER_FOUND';
    };

export async function dispatchNextDriver(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  rideId: string;
  pickup: GeoPoint;
  now?: Date;
  offerTtlSeconds?: number;
  maxLocationAgeSeconds?: number;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
}): Promise<DispatchNextResult> {
  const now = input.now ?? new Date();
  const ride = await input.rides.findById(input.rideId);

  if (
    ride == null ||
    (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')
  ) {
    throw new Error('Corrida não está pronta para despacho.');
  }

  const offers = await input.matching.listOffersForRide(ride.id);
  for (const offer of offers) {
    if (offer.status !== 'OFFERED') continue;

    if (Date.parse(offer.expiresAt) > now.getTime()) {
      return { kind: 'OFFER_ACTIVE', offer };
    }

    await input.matching.expireOffer({
      offerId: offer.id,
      expiredAt: now.toISOString(),
    });
  }

  const attemptedDriverIds = new Set(offers.map((offer) => offer.driverId));
  let candidates = rankEligibleDrivers({
    ride,
    pickup: input.pickup,
    candidates: await input.drivers.listOnline(),
    now,
    ...(input.maxLocationAgeSeconds != null
      ? { maxLocationAgeSeconds: input.maxLocationAgeSeconds }
      : {}),
  }).filter((candidate) => !attemptedDriverIds.has(candidate.supply.driverId));

  const holdIsActive =
    ride.reservedDriverId != null &&
    ride.driverHoldExpiresAt != null &&
    Date.parse(ride.driverHoldExpiresAt) > now.getTime();

  if (holdIsActive) {
    candidates = candidates.filter(
      (candidate) => candidate.supply.driverId === ride.reservedDriverId,
    );
  }

  if (input.canOfferDriver != null) {
    const allowed = [];
    for (const candidate of candidates) {
      if (await input.canOfferDriver(candidate.supply.driverId)) {
        allowed.push(candidate);
      }
    }
    candidates = allowed;
  }

  const next = candidates[0];
  if (next == null) {
    await input.matching.markNoDriverFound({
      rideId: ride.id,
      at: now.toISOString(),
    });
    return { kind: 'NO_DRIVER_FOUND' };
  }

  const created = await createDriverOffer({
    repository: input.matching,
    rideId: ride.id,
    driver: next,
    now,
    ttlSeconds:
      input.offerTtlSeconds ?? DEFAULT_DRIVER_OFFER_TTL_SECONDS,
  });

  return { kind: 'OFFER_CREATED', offer: created.offer };
}
