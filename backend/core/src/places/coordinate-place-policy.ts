import type {
  PricingCatalogSnapshot,
  PricingLocalityGeofence,
} from '../pricing/catalog-snapshot.js';
import type { ZoneId } from '../pricing/types.js';
import { assertCatalogLocationSupported } from '../pricing/catalog-location-policy.js';

export class CoordinateClassificationError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_COORDINATES'
      | 'COORDINATE_NOT_CLASSIFIED',
    message: string,
  ) {
    super(message);
    this.name = 'CoordinateClassificationError';
  }
}

function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validGeofence(
  value: PricingLocalityGeofence,
): boolean {
  return (
    typeof value.localityId === 'string' &&
    value.localityId.trim().length > 0 &&
    Number.isFinite(value.centerLatitude) &&
    value.centerLatitude >= -90 &&
    value.centerLatitude <= 90 &&
    Number.isFinite(value.centerLongitude) &&
    value.centerLongitude >= -180 &&
    value.centerLongitude <= 180 &&
    Number.isFinite(value.radiusKm) &&
    value.radiusKm > 0 &&
    value.radiusKm <= 100
  );
}

export interface ClassifiedCoordinateLocation {
  zoneId: ZoneId;
  localityId: string;
}

export function classifyCoordinateByCatalog(input: {
  catalog: PricingCatalogSnapshot;
  latitude: number;
  longitude: number;
}): ClassifiedCoordinateLocation {
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new CoordinateClassificationError(
      'INVALID_COORDINATES',
      'Coordenadas inválidas para classificação.',
    );
  }

  const point = {
    latitude: input.latitude,
    longitude: input.longitude,
  };

  const candidates = input.catalog.localityGeofences
    .filter(validGeofence)
    .map((geofence) => ({
      geofence,
      distanceKm: distanceKm(point, {
        latitude: geofence.centerLatitude,
        longitude: geofence.centerLongitude,
      }),
    }))
    .filter(({ geofence, distanceKm }) => distanceKm <= geofence.radiusKm)
    .sort((a, b) => {
      const radius = a.geofence.radiusKm - b.geofence.radiusKm;
      if (radius !== 0) return radius;
      const normalizedA = a.distanceKm / a.geofence.radiusKm;
      const normalizedB = b.distanceKm / b.geofence.radiusKm;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      const zone = a.geofence.zoneId.localeCompare(b.geofence.zoneId);
      if (zone !== 0) return zone;
      return a.geofence.localityId.localeCompare(b.geofence.localityId);
    });

  for (const candidate of candidates) {
    const ref: ClassifiedCoordinateLocation = {
      zoneId: candidate.geofence.zoneId,
      localityId: candidate.geofence.localityId,
    };
    try {
      assertCatalogLocationSupported({
        catalog: input.catalog,
        ref,
        field: 'destination',
      });
      return ref;
    } catch {
      // Geofence obsoleta ou zona desativada: não classifica.
    }
  }

  throw new CoordinateClassificationError(
    'COORDINATE_NOT_CLASSIFIED',
    'Este ponto não pertence a uma localidade geográfica aprovada no catálogo vigente.',
  );
}
