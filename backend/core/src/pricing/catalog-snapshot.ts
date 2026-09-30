import {
  CAR_REFERENCE_KM_PER_LITER,
  COMMISSION_BPS,
  FIXED_ROUTES,
  FREE_PICKUP_KM,
  FUEL_PRICE_CENTS_PER_LITER,
  JERI_DELIVERY_ABOVE_MAX_CENTS,
  JIJOCA_LOCALITIES,
  MOTO_REFERENCE_KM_PER_LITER,
  PREA_COMFORT_SURCHARGE_CENTS,
  PREA_LOCAL_CAR_NIGHT_LOCALITY_IDS,
  PREA_LOCAL_CAR_NIGHT_SURCHARGE_CENTS,
  PREA_LOCALITIES,
  type FixedRoutePrice,
  type LocalityPricing,
} from './catalog.v1.js';
import type {
  PricePeriod,
  ServiceCategory,
  ZoneId,
} from './types.js';

export interface PricingLocalityGeofence {
  zoneId: ZoneId;
  localityId: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
}

export interface PricingCatalogSnapshot {
  catalogVersion: string;
  categories: ServiceCategory[];
  periods: PricePeriod[];
  zones: ZoneId[];
  commissionBps: number;
  periodPolicy: {
    nightStartHour: number;
    dayStartHour: number;
  };
  categoryPolicies: Record<
    ServiceCategory,
    {
      enabled: boolean;
      requiresFourByFourOnJeriBoundary: boolean;
    }
  >;
  zonePolicies: Record<ZoneId, { enabled: boolean }>;
  externalLocalities: string[];
  localityGeofences: PricingLocalityGeofence[];
  pickupPolicy: {
    freeKm: number;
    fuelPriceCentsPerLiter: number;
    motoReferenceKmPerLiter: number;
    carReferenceKmPerLiter: number;
  };
  surcharges: {
    preaComfortCents: number;
    preaLocalCarAfter22Cents: number;
    preaLocalCarAfter22LocalityIds: string[];
  };
  jeri: {
    buggy: {
      minPassengers: number;
      maxPassengers: number;
      dayBaseCents: number;
      after22BaseCents: number;
      perPassengerCents: number;
    };
    deliveryBands: Array<{
      maxKm: number;
      amountCents: number;
    }>;
    deliveryAboveMaxCents: number;
  };
  localities: {
    prea: Record<string, LocalityPricing>;
    jijoca: Record<string, LocalityPricing>;
  };
  fixedRoutes: FixedRoutePrice[];
}

export const STATIC_PRICING_CATALOG_V1: PricingCatalogSnapshot = {
  catalogVersion: 'v1',
  categories: [
    'moto',
    'delivery',
    'car',
    'comfort_black',
    'buggy',
  ],
  periods: ['day', 'after_22'],
  zones: ['jericoacoara', 'jijoca', 'prea', 'external'],
  commissionBps: COMMISSION_BPS,
  periodPolicy: {
    nightStartHour: 22,
    dayStartHour: 6,
  },
  categoryPolicies: {
    moto: {
      enabled: true,
      requiresFourByFourOnJeriBoundary: false,
    },
    delivery: {
      enabled: true,
      requiresFourByFourOnJeriBoundary: false,
    },
    car: {
      enabled: true,
      // A tarifa de Carro Preá ↔ Jeri só pode casar com veículo 4x4 aprovado.
      requiresFourByFourOnJeriBoundary: true,
    },
    comfort_black: {
      enabled: true,
      requiresFourByFourOnJeriBoundary: true,
    },
    buggy: {
      enabled: true,
      requiresFourByFourOnJeriBoundary: false,
    },
  },
  zonePolicies: {
    jericoacoara: { enabled: true },
    jijoca: { enabled: true },
    prea: { enabled: true },
    external: { enabled: true },
  },
  externalLocalities: [
    'airport-jjd',
    'triangulo-do-marco',
    'santana-do-acarau',
    'bela-cruz',
    'itapipoca',
    'parazinha',
    'morrinhos',
    'amontada',
    'camocim',
    'itarema',
    'acarau',
    'granja',
    'sobral',
    'marco',
    'cruz',
  ].sort(),
  localityGeofences: [
    {
      zoneId: 'jericoacoara',
      localityId: 'jericoacoara',
      centerLatitude: -2.80023,
      centerLongitude: -40.51638,
      radiusKm: 7,
    },
    {
      zoneId: 'jijoca',
      localityId: 'jijoca',
      centerLatitude: -2.89860,
      centerLongitude: -40.45060,
      radiusKm: 7.5,
    },
    {
      zoneId: 'prea',
      localityId: 'prea',
      centerLatitude: -2.82017,
      centerLongitude: -40.41467,
      radiusKm: 6.5,
    },
    {
      zoneId: 'external',
      localityId: 'airport-jjd',
      centerLatitude: -2.906425,
      centerLongitude: -40.357338,
      radiusKm: 3,
    },
  ],
  pickupPolicy: {
    freeKm: FREE_PICKUP_KM,
    fuelPriceCentsPerLiter: FUEL_PRICE_CENTS_PER_LITER,
    motoReferenceKmPerLiter: MOTO_REFERENCE_KM_PER_LITER,
    carReferenceKmPerLiter: CAR_REFERENCE_KM_PER_LITER,
  },
  surcharges: {
    preaComfortCents: PREA_COMFORT_SURCHARGE_CENTS,
    preaLocalCarAfter22Cents:
      PREA_LOCAL_CAR_NIGHT_SURCHARGE_CENTS,
    preaLocalCarAfter22LocalityIds: [
      ...PREA_LOCAL_CAR_NIGHT_LOCALITY_IDS,
    ].sort(),
  },
  jeri: {
    buggy: {
      minPassengers: 1,
      maxPassengers: 4,
      dayBaseCents: 4000,
      after22BaseCents: 6000,
      perPassengerCents: 200,
    },
    deliveryBands: [
      { maxKm: 0.7, amountCents: 500 },
      { maxKm: 1.2, amountCents: 500 },
      { maxKm: 1.6, amountCents: 500 },
      { maxKm: 2.0, amountCents: 500 },
    ],
    deliveryAboveMaxCents: JERI_DELIVERY_ABOVE_MAX_CENTS,
  },
  localities: {
    prea: structuredClone(PREA_LOCALITIES),
    jijoca: structuredClone(JIJOCA_LOCALITIES),
  },
  fixedRoutes: structuredClone(FIXED_ROUTES),
};


export function normalizePricingCatalogSnapshot(
  input: PricingCatalogSnapshot,
): PricingCatalogSnapshot {
  const value = input as PricingCatalogSnapshot & {
    zonePolicies?: PricingCatalogSnapshot['zonePolicies'];
    externalLocalities?: string[];
    localityGeofences?: PricingCatalogSnapshot['localityGeofences'];
    categoryPolicies?: PricingCatalogSnapshot['categoryPolicies'];
  };

  return {
    ...structuredClone(value),
    jeri: {
      ...structuredClone(value.jeri),
      deliveryAboveMaxCents:
        value.jeri?.deliveryAboveMaxCents ??
        STATIC_PRICING_CATALOG_V1.jeri.deliveryAboveMaxCents,
    },
    periodPolicy:
      value.periodPolicy == null
        ? { nightStartHour: 22, dayStartHour: 6 }
        : { ...value.periodPolicy },
    categoryPolicies:
      value.categoryPolicies == null
        ? structuredClone(STATIC_PRICING_CATALOG_V1.categoryPolicies)
        : structuredClone(value.categoryPolicies),
    zonePolicies:
      value.zonePolicies == null
        ? structuredClone(STATIC_PRICING_CATALOG_V1.zonePolicies)
        : {
            ...structuredClone(STATIC_PRICING_CATALOG_V1.zonePolicies),
            ...structuredClone(value.zonePolicies),
          },
    externalLocalities:
      value.externalLocalities == null
        ? [...STATIC_PRICING_CATALOG_V1.externalLocalities]
        : [...value.externalLocalities],
    localityGeofences:
      value.localityGeofences == null
        ? structuredClone(STATIC_PRICING_CATALOG_V1.localityGeofences)
        : structuredClone(value.localityGeofences),
  };
}
