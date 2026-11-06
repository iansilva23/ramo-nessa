import { classifyCoordinateByCatalog } from '../places/coordinate-place-policy.js';
import type { GeoPoint } from '../matching/select-driver.js';
import {
  STATIC_PRICING_CATALOG_V1,
  type PricingCatalogSnapshot,
} from '../pricing/catalog-snapshot.js';
import type { LocationRef } from '../pricing/types.js';

interface CircleZone {
  id: 'jericoacoara' | 'jijoca' | 'prea' | 'airport-jjd';
  latitude: number;
  longitude: number;
  radiusKm: number;
}

const LOCAL_ZONES: readonly CircleZone[] = [
  {
    id: 'jericoacoara',
    latitude: -2.80023,
    longitude: -40.51638,
    radiusKm: 7,
  },
  {
    id: 'jijoca',
    latitude: -2.89860,
    longitude: -40.45060,
    radiusKm: 7.5,
  },
  {
    id: 'prea',
    latitude: -2.82017,
    longitude: -40.41467,
    radiusKm: 6.5,
  },
  {
    id: 'airport-jjd',
    latitude: -2.906425,
    longitude: -40.357338,
    radiusKm: 3,
  },
];



export class PricingLocationMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingLocationMismatchError';
  }
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function distanceKm(a: GeoPoint, b: GeoPoint): number {
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

function containingLocalZone(point: GeoPoint): CircleZone | null {
  for (const zone of LOCAL_ZONES) {
    if (
      distanceKm(point, {
        latitude: zone.latitude,
        longitude: zone.longitude,
      }) <= zone.radiusKm
    ) {
      return zone;
    }
  }
  return null;
}

function assertKnownLocality(
  ref: LocationRef,
  field: string,
  catalog: PricingCatalogSnapshot,
): void {
  const localityId = ref.localityId;
  if (localityId == null) return;

  if (
    ref.zoneId === 'prea' &&
    catalog.localities.prea[localityId] == null
  ) {
    throw new PricingLocationMismatchError(
      `${field}.localityId não pertence à tabela do Preá.`,
    );
  }

  if (
    ref.zoneId === 'jijoca' &&
    catalog.localities.jijoca[localityId] == null
  ) {
    throw new PricingLocationMismatchError(
      `${field}.localityId não pertence à tabela de Jijoca.`,
    );
  }

  if (
    ref.zoneId === 'jericoacoara' &&
    localityId !== 'jericoacoara'
  ) {
    throw new PricingLocationMismatchError(
      `${field}.localityId não pertence à tabela de Jericoacoara.`,
    );
  }

  if (
    ref.zoneId === 'external' &&
    !catalog.externalLocalities.includes(localityId)
  ) {
    throw new PricingLocationMismatchError(
      `${field}.localityId externo não é aprovado.`,
    );
  }
}

export function assertPricingLocationMatchesPoint(input: {
  ref: LocationRef;
  point: GeoPoint;
  field: 'origin' | 'destination';
  catalog?: PricingCatalogSnapshot;
  localityProofVerified?: boolean;
}): void {
  const catalog = input.catalog ?? STATIC_PRICING_CATALOG_V1;

  // Nunca aceitar latitude/longitude inválidas: NaN escaparia à comparação
  // "distance > radiusKm" e poderia validar uma geofence indevidamente.
  const point = input.point;
  if (
    point == null ||
    typeof point.latitude !== 'number' ||
    typeof point.longitude !== 'number' ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new PricingLocationMismatchError(
      `${input.field} possui coordenadas GPS inválidas.`,
    );
  }

  if (!input.ref || !catalog.zonePolicies[input.ref.zoneId]?.enabled) {
    throw new PricingLocationMismatchError(
      `${input.field}.zoneId está desativada no catálogo vigente.`,
    );
  }

  if (catalog.managedOperations != null) {
    let selected;
    try { selected = classifyCoordinateByCatalog({catalog, ...point}); }
    catch { throw new PricingLocationMismatchError('Ponto fora das regiões atendidas.'); }
    if (selected.zoneId !== input.ref.zoneId || selected.localityId !== (input.ref.localityId ?? input.ref.zoneId))
      throw new PricingLocationMismatchError('A região selecionada não corresponde ao ponto no mapa. Atualize a seleção.');
    return;
  }
  assertKnownLocality(input.ref, input.field, catalog);

  if (
    input.localityProofVerified === true &&
    input.ref.localityId != null
  ) {
    return;
  }

  if (input.ref.localityId != null) {
    const geofence = catalog.localityGeofences.find(
      (candidate) =>
        candidate.zoneId === input.ref.zoneId &&
        candidate.localityId === input.ref.localityId,
    );
    if (geofence != null) {
      // Fail closed if a versioned catalog contains an invalid geofence.
      // NaN radius would otherwise make "distance > radius" false.
      if (!Number.isFinite(geofence.centerLatitude) ||
          geofence.centerLatitude < -90 || geofence.centerLatitude > 90 ||
          !Number.isFinite(geofence.centerLongitude) ||
          geofence.centerLongitude < -180 || geofence.centerLongitude > 180 ||
          !Number.isFinite(geofence.radiusKm) ||
          geofence.radiusKm <= 0 || geofence.radiusKm > 100) {
        throw new PricingLocationMismatchError(
          `${input.field}.localityId possui geocerca inválida no catálogo.`,
        );
      }
      const distance = distanceKm(input.point, {
        latitude: geofence.centerLatitude,
        longitude: geofence.centerLongitude,
      });
      if (distance > geofence.radiusKm) {
        throw new PricingLocationMismatchError(
          `${input.field}.localityId não confere com a área cadastrada.`,
        );
      }
      return;
    }
  }

  const localZone = containingLocalZone(input.point);

  if (input.ref.zoneId === 'external') {
    if (input.ref.localityId == null) {
      if (localZone != null) {
        throw new PricingLocationMismatchError(
          `${input.field} externo sem localidade não pode apontar para uma zona local.`,
        );
      }
      return;
    }

    if (input.ref.localityId === 'airport-jjd') {
      if (localZone?.id !== 'airport-jjd') {
        throw new PricingLocationMismatchError(
          `${input.field} declarado como Aeroporto JJD não confere com o GPS.`,
        );
      }
      return;
    }

    // Destinos externos sem geofence própria continuam protegidos contra
    // coordenadas que pertençam claramente a uma zona local.
    if (localZone != null) {
      throw new PricingLocationMismatchError(
        `${input.field} externo não confere com uma coordenada de zona local.`,
      );
    }
    return;
  }

  if (localZone?.id !== input.ref.zoneId) {
    throw new PricingLocationMismatchError(
      `${input.field}.zoneId não confere com as coordenadas informadas.`,
    );
  }
}
