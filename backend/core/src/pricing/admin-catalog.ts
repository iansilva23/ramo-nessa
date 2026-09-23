import {
  CAR_REFERENCE_KM_PER_LITER,
  COMMISSION_BPS,
  FIXED_ROUTES,
  FREE_PICKUP_KM,
  FUEL_PRICE_CENTS_PER_LITER,
  JIJOCA_LOCALITIES,
  MOTO_REFERENCE_KM_PER_LITER,
  PREA_COMFORT_SURCHARGE_CENTS,
  PREA_LOCAL_CAR_NIGHT_LOCALITY_IDS,
  PREA_LOCAL_CAR_NIGHT_SURCHARGE_CENTS,
  PREA_LOCALITIES,
  type LocalityPricing,
  type PriceValue,
} from './catalog.v1.js';
import type {
  PricePeriod,
  ServiceCategory,
  ZoneId,
} from './types.js';

function priceValueView(value: PriceValue | undefined) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return { kind: 'exact' as const, amountCents: value };
  }
  return {
    kind: 'range' as const,
    minCents: value.minCents,
    maxCents: value.maxCents,
  };
}

function localityView(
  localityId: string,
  pricing: LocalityPricing,
) {
  return {
    localityId,
    prices: {
      moto: priceValueView(pricing.moto),
      delivery: priceValueView(pricing.delivery),
      car: priceValueView(pricing.car),
    },
  };
}

export function adminPricingCatalogView() {
  const categories: ServiceCategory[] = [
    'moto',
    'delivery',
    'car',
    'comfort_black',
    'buggy',
  ];
  const periods: PricePeriod[] = ['day', 'after_22'];
  const zones: ZoneId[] = [
    'jericoacoara',
    'jijoca',
    'prea',
    'external',
  ];

  return {
    catalogVersion: 'v1',
    authority: 'core',
    mode: 'static',
    editable: false,
    categories,
    periods,
    zones,
    commissionBps: COMMISSION_BPS,
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
    localities: {
      prea: Object.entries(PREA_LOCALITIES)
        .map(([localityId, pricing]) =>
          localityView(localityId, pricing),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
      jijoca: Object.entries(JIJOCA_LOCALITIES)
        .map(([localityId, pricing]) =>
          localityView(localityId, pricing),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
    },
    fixedRoutes: FIXED_ROUTES.map((route) => ({
      id: route.id,
      a: route.a,
      b: route.b,
      category: route.category,
      dayCents: route.dayCents,
      after22Cents: route.after22Cents,
    })),
  };
}


export type PricingCatalogSnapshot =
  ReturnType<typeof adminPricingCatalogView>;
