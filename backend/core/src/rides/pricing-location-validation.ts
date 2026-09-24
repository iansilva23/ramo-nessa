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
}): void {
  const catalog = input.catalog ?? STATIC_PRICING_CATALOG_V1;

  if (!catalog.zonePolicies[input.ref.zoneId].enabled) {
    throw new PricingLocationMismatchError(
      `${input.field}.zoneId está desativada no catálogo vigente.`,
    );
  }

  assertKnownLocality(input.ref, input.field, catalog);

  const localZone = containingLocalZone(input.point);

  if (input.ref.zoneId === 'external') {
    if (input.ref.localityId == null) {
      throw new PricingLocationMismatchError(
        `${input.field}.localityId é obrigatório para destino externo.`,
      );
    }

    if (input.ref.localityId === 'airport-jjd') {
      if (localZone?.id !== 'airport-jjd') {
        throw new PricingLocationMismatchError(
          `${input.field} declarado como Aeroporto JJD não confere com o GPS.`,
        );
      }
      return;
    }

    // Destinos externos aprovados não podem usar coordenadas que pertencem
    // claramente a uma das zonas locais. A validação exata por município
    // depende do catálogo geográfico autoritativo da próxima etapa.
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
