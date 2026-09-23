import type { DriverSupplyRepository } from './driver-supply-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import {
  acceptDriverOffer,
  rejectDriverOffer,
} from '../matching/offer-service.js';
import { dispatchNextDriver } from '../matching/dispatch-next-driver.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { RideRecord } from '../rides/ride.js';

export class DriverAppError extends Error {
  constructor(
    public readonly code:
      | 'DRIVER_NOT_REGISTERED'
      | 'DRIVER_BUSY'
      | 'RIDE_NOT_FOUND'
      | 'RIDE_NOT_PREPARED'
      | 'RIDE_NOT_ASSIGNED_TO_DRIVER'
      | 'INVALID_RIDE_ACTION'
      | 'PAID_PAYMENT_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DriverAppError';
  }
}

export async function getDriverSupplyForApp(input: {
  drivers: DriverSupplyRepository;
  driverId: string;
}) {
  const supply = await input.drivers.findByDriverId(input.driverId);
  if (supply == null) {
    throw new DriverAppError(
      'DRIVER_NOT_REGISTERED',
      'Motorista ainda não possui cadastro aprovado.',
    );
  }

  return {
    driverId: supply.driverId,
    vehicleId: supply.vehicleId,
    categories: supply.categories,
    fourByFour: supply.fourByFour,
    seatCapacity: supply.seatCapacity,
    online: supply.online,
    busy: supply.busy,
    latitude: supply.latitude,
    longitude: supply.longitude,
    locationUpdatedAt: supply.locationUpdatedAt,
  };
}

export async function updateDriverSupplyFromApp(input: {
  drivers: DriverSupplyRepository;
  driverId: string;
  online?: boolean;
  latitude?: number;
  longitude?: number;
  now?: Date;
}) {
  const current = await input.drivers.findByDriverId(input.driverId);
  if (current == null) {
    throw new DriverAppError(
      'DRIVER_NOT_REGISTERED',
      'Motorista ainda não possui cadastro aprovado.',
    );
  }

  if (current.busy && input.online === false) {
    throw new DriverAppError(
      'DRIVER_BUSY',
      'Não é possível ficar offline durante uma corrida ativa.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  return input.drivers.upsert({
    ...current,
    ...(input.online != null ? { online: input.online } : {}),
    ...(input.latitude != null && input.longitude != null
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          locationUpdatedAt: instant,
        }
      : {}),
    updatedAt: instant,
  });
}

export function driverOfferView(offer: {
  id: string;
  rideId: string;
  approximatePickupDistanceKm: number;
  expiresAt: string;
}, ride: RideRecord) {
  return {
    id: offer.id,
    rideId: offer.rideId,
    expiresAt: offer.expiresAt,
    approximatePickupDistanceKm: offer.approximatePickupDistanceKm,
    category: ride.category,
    passengers: ride.passengers,
    origin: ride.origin,
    destination: ride.destination,
    driverEarningsCents: ride.quote.driverNetCents,
    pickupCompensationCents: ride.quote.pickupCompensationCents,
  };
}

export async function currentDriverOffer(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  driverId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const offer = await input.matching.findLatestOfferedForDriver(
    input.driverId,
  );
  if (offer == null) return null;

  const ride = await input.rides.findById(offer.rideId);
  if (ride == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida da oferta não foi encontrada.',
    );
  }

  if (Date.parse(offer.expiresAt) <= now.getTime()) {
    await input.matching.expireOffer({
      offerId: offer.id,
      expiredAt: now.toISOString(),
    });

    if (
      ride.pickupLatitude != null &&
      ride.pickupLongitude != null &&
      (ride.state === 'PAID' || ride.state === 'SEARCHING_DRIVER')
    ) {
      await dispatchNextDriver({
        rides: input.rides,
        drivers: input.drivers,
        matching: input.matching,
        rideId: ride.id,
        pickup: {
          latitude: ride.pickupLatitude,
          longitude: ride.pickupLongitude,
        },
        now,
      });
    }

    return null;
  }

  return driverOfferView(offer, ride);
}

export async function acceptOfferFromDriverApp(input: {
  rides: RideRepository;
  matching: RideMatchingRepository;
  offerId: string;
  driverId: string;
  now?: Date;
}) {
  const result = await acceptDriverOffer({
    repository: input.matching,
    offerId: input.offerId,
    driverId: input.driverId,
    ...(input.now != null ? { now: input.now } : {}),
  });

  return {
    offerId: result.offer.id,
    ride: {
      id: result.ride.id,
      state: result.ride.state,
      category: result.ride.category,
      passengers: result.ride.passengers,
      origin: result.ride.origin,
      destination: result.ride.destination,
      pickupLatitude: result.ride.pickupLatitude,
      pickupLongitude: result.ride.pickupLongitude,
      dropoffLatitude: result.ride.dropoffLatitude,
      dropoffLongitude: result.ride.dropoffLongitude,
      driverEarningsCents: result.ride.quote.driverNetCents,
      pickupCompensationCents:
        result.ride.quote.pickupCompensationCents,
    },
  };
}

export async function rejectOfferFromDriverApp(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  offerId: string;
  driverId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rejected = await rejectDriverOffer({
    repository: input.matching,
    offerId: input.offerId,
    driverId: input.driverId,
    now,
  });

  const ride = await input.rides.findById(rejected.rideId);
  if (ride == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida da oferta não foi encontrada.',
    );
  }

  if (
    ride.pickupLatitude == null ||
    ride.pickupLongitude == null
  ) {
    throw new DriverAppError(
      'RIDE_NOT_PREPARED',
      'Corrida não possui ponto de embarque preparado.',
    );
  }

  const dispatch = await dispatchNextDriver({
    rides: input.rides,
    drivers: input.drivers,
    matching: input.matching,
    rideId: ride.id,
    pickup: {
      latitude: ride.pickupLatitude,
      longitude: ride.pickupLongitude,
    },
    now,
  });

  return {
    rejectedOfferId: rejected.id,
    retryStatus:
      dispatch.kind === 'OFFER_CREATED' ||
      dispatch.kind === 'OFFER_ACTIVE'
        ? 'SEARCHING_DRIVER'
        : dispatch.kind,
  };
}
