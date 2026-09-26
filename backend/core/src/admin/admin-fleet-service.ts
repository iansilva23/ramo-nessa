import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { RideRecord } from '../rides/ride.js';

export type AdminFleetAvailability =
  | 'free'
  | 'reserved'
  | 'on_ride'
  | 'busy';

const LIVE_RIDE_STATES = new Set<RideRecord['state']>([
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
]);

export async function adminFleetSnapshot(input: {
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  rides: RideRepository;
  now?: Date;
  staleAfterSeconds?: number;
}) {
  const now = input.now ?? new Date();
  const staleAfterSeconds = Math.max(
    30,
    Math.min(900, Math.trunc(input.staleAfterSeconds ?? 120)),
  );
  const supplies = await input.drivers.listFleet();

  const items = await Promise.all(
    supplies.map(async (supply) => {
      const [profile, vehicle, candidateRide] = await Promise.all([
        input.registry.findProfile(supply.driverId),
        input.registry.findVehicleByDriverId(supply.driverId),
        input.rides.findActiveByDriverId(supply.driverId),
      ]);

      const currentRide =
        candidateRide != null &&
        LIVE_RIDE_STATES.has(candidateRide.state)
          ? candidateRide
          : null;
      const reservedRide =
        currentRide == null && supply.reservedRideId != null
          ? await input.rides.findById(supply.reservedRideId)
          : null;
      const ride = currentRide ?? reservedRide;

      let availability: AdminFleetAvailability;
      if (currentRide != null) {
        availability = 'on_ride';
      } else if (supply.reservedRideId != null) {
        availability = 'reserved';
      } else if (supply.busy) {
        availability = 'busy';
      } else {
        availability = 'free';
      }

      const locationMs = Date.parse(supply.locationUpdatedAt);
      const ageSeconds = Number.isFinite(locationMs)
        ? Math.max(0, Math.floor((now.getTime() - locationMs) / 1000))
        : Number.MAX_SAFE_INTEGER;
      const gpsStatus =
        ageSeconds <= staleAfterSeconds ? 'fresh' : 'stale';

      return {
        driverId: supply.driverId,
        driverName:
          profile?.preferredName ??
          profile?.fullName ??
          supply.driverId,
        vehicle: {
          id: supply.vehicleId,
          plate: vehicle?.plateNormalized ?? null,
          make: vehicle?.make ?? null,
          model: vehicle?.model ?? null,
          color: vehicle?.color ?? null,
          fourByFour: supply.fourByFour,
          seatCapacity: supply.seatCapacity,
        },
        categories: [...supply.categories],
        availability,
        currentServiceCategory: ride?.category ?? null,
        ride:
          ride == null
            ? null
            : {
                id: ride.id,
                state: ride.state,
                category: ride.category,
                passengers: ride.passengers,
              },
        location: {
          latitude: supply.latitude,
          longitude: supply.longitude,
          updatedAt: supply.locationUpdatedAt,
          ageSeconds,
          status: gpsStatus,
        },
      };
    }),
  );

  return {
    generatedAt: now.toISOString(),
    staleAfterSeconds,
    summary: {
      totalOnline: items.length,
      free: items.filter((item) => item.availability === 'free').length,
      reserved: items.filter(
        (item) => item.availability === 'reserved',
      ).length,
      onRide: items.filter(
        (item) => item.availability === 'on_ride',
      ).length,
      busy: items.filter((item) => item.availability === 'busy').length,
      staleGps: items.filter(
        (item) => item.location.status === 'stale',
      ).length,
    },
    items,
  };
}
