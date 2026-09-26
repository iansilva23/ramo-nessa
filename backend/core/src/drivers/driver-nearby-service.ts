import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { DriverSupplyRepository } from './driver-supply-repository.js';

const MAX_NEARBY_DISTANCE_KM = 15;
const MAX_LOCATION_AGE_MS = 90 * 1000;

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export async function nearbyDriversForApp(input: {
  drivers: DriverSupplyRepository;
  settings: OperationalSettingsRepository;
  driverId: string;
  now?: Date;
}) {
  const settings = await input.settings.get();
  if (!settings.showNearbyDrivers) {
    return {
      enabled: false,
      refreshAfterSeconds: 30,
      drivers: [],
    };
  }

  const current = await input.drivers.findByDriverId(input.driverId);
  if (current == null || !current.online) {
    return {
      enabled: true,
      refreshAfterSeconds: 20,
      drivers: [],
    };
  }

  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const fleet = await input.drivers.listFleet();

  const drivers = fleet
    .filter((candidate) => candidate.driverId !== input.driverId)
    .filter((candidate) => candidate.online)
    .filter((candidate) => {
      const ageMs = nowMs - Date.parse(candidate.locationUpdatedAt);
      return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MAX_LOCATION_AGE_MS;
    })
    .map((candidate) => ({
      driverId: candidate.driverId,
      category: candidate.categories[0] ?? 'car',
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      busy: candidate.busy,
      locationAgeSeconds: Math.max(
        0,
        Math.round((nowMs - Date.parse(candidate.locationUpdatedAt)) / 1000),
      ),
      distanceKm: distanceKm(
        current.latitude,
        current.longitude,
        candidate.latitude,
        candidate.longitude,
      ),
    }))
    .filter((candidate) => candidate.distanceKm <= MAX_NEARBY_DISTANCE_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 40)
    .map(({
      driverId,
      category,
      latitude,
      longitude,
      busy,
      locationAgeSeconds,
    }) => ({
      driverId,
      category,
      latitude,
      longitude,
      busy,
      locationAgeSeconds,
    }));

  return {
    enabled: true,
    refreshAfterSeconds: 20,
    drivers,
  };
}
