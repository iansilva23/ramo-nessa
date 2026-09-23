import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
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
}

export async function passengerRideTracking(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  rideId: string;
  passengerId: string;
  now?: Date;
}): Promise<PassengerRideTrackingSnapshot | null> {
  const ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) {
    return null;
  }

  let driverLocation: PassengerRideTrackingSnapshot['driverLocation'] = null;
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
  };
}
