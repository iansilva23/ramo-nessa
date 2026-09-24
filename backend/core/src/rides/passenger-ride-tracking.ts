import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import { driverPhotoPath } from '../drivers/driver-profile-photo-service.js';
import type { RideRepository } from './ride-repository.js';
import type { RideRecord } from './ride.js';

const LOCATION_VISIBLE_STATES = new Set<RideRecord['state']>([
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
]);

export interface PassengerRideTrackingSnapshot {
  ride: {
    id: string;
    state: RideRecord['state'];
    category: RideRecord['category'];
    origin: RideRecord['origin'];
    destination: RideRecord['destination'];
    pickupLatitude?: number;
    pickupLongitude?: number;
    dropoffLatitude?: number;
    dropoffLongitude?: number;
  };
  driverLocation: {
    latitude: number;
    longitude: number;
    updatedAt: string;
    stale: boolean;
  } | null;
  driver: {
    id: string;
    displayName: string;
    photoPath?: string;
    ratingAverage?: number;
    ratingCount: number;
  } | null;
}

export async function passengerRideTracking(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  rideId: string;
  passengerId: string;
  now?: Date;
}): Promise<PassengerRideTrackingSnapshot | null> {
  const ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) {
    return null;
  }

  let driverLocation: PassengerRideTrackingSnapshot['driverLocation'] = null;
  let driver: PassengerRideTrackingSnapshot['driver'] = null;
  if (ride.driverId != null && LOCATION_VISIBLE_STATES.has(ride.state)) {
    const supply = await input.drivers.findByDriverId(ride.driverId);
    if (supply != null) {
      const now = input.now ?? new Date();
      const updatedAtMs = Date.parse(supply.locationUpdatedAt);
      const stale =
        Number.isNaN(updatedAtMs) ||
        now.getTime() - updatedAtMs > 60_000;

      driverLocation = {
        latitude: supply.latitude,
        longitude: supply.longitude,
        updatedAt: supply.locationUpdatedAt,
        stale,
      };
    }

    const profile = await input.registry.findProfile(ride.driverId);
    if (profile != null) {
      driver = {
        id: ride.driverId,
        displayName:
          profile.preferredName?.trim() ||
          profile.fullName.trim() ||
          'Motorista Ramo Nessa',
        ...(driverPhotoPath(ride.driverId, profile.photoUpdatedAt) == null
          ? {}
          : {
              photoPath: driverPhotoPath(
                ride.driverId,
                profile.photoUpdatedAt,
              ),
            }),
        ...(profile.ratingAverage == null
          ? {}
          : { ratingAverage: profile.ratingAverage }),
        ratingCount: profile.ratingCount ?? 0,
      };
    }
  }

  return {
    ride: {
      id: ride.id,
      state: ride.state,
      category: ride.category,
      origin: ride.origin,
      destination: ride.destination,
      ...(ride.pickupLatitude != null
        ? { pickupLatitude: ride.pickupLatitude }
        : {}),
      ...(ride.pickupLongitude != null
        ? { pickupLongitude: ride.pickupLongitude }
        : {}),
      ...(ride.dropoffLatitude != null
        ? { dropoffLatitude: ride.dropoffLatitude }
        : {}),
      ...(ride.dropoffLongitude != null
        ? { dropoffLongitude: ride.dropoffLongitude }
        : {}),
    },
    driverLocation,
    driver,
  };
}
