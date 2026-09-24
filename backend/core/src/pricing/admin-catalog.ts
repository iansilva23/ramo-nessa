import type {
  LocalityPricing,
  PriceValue,
} from './catalog.v1.js';
import {
  STATIC_PRICING_CATALOG_V1,
  type PricingCatalogSnapshot,
} from './catalog-snapshot.js';

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

export function adminPricingCatalogView(
  snapshot: PricingCatalogSnapshot = STATIC_PRICING_CATALOG_V1,
  options: {
    mode?: 'static' | 'versioned';
    editable?: boolean;
    versionId?: string | null;
    versionNumber?: number | null;
    effectiveFrom?: string | null;
  } = {},
) {
  return {
    catalogVersion: snapshot.catalogVersion,
    authority: 'core' as const,
    mode: options.mode ?? 'static',
    editable: options.editable ?? false,
    versionId: options.versionId ?? null,
    versionNumber: options.versionNumber ?? null,
    effectiveFrom: options.effectiveFrom ?? null,
    categories: [...snapshot.categories],
    periods: [...snapshot.periods],
    zones: [...snapshot.zones],
    commissionBps: snapshot.commissionBps,
    pickupPolicy: { ...snapshot.pickupPolicy },
    surcharges: {
      ...snapshot.surcharges,
      preaLocalCarAfter22LocalityIds: [
        ...snapshot.surcharges.preaLocalCarAfter22LocalityIds,
      ],
    },
    jeri: {
      buggy: { ...snapshot.jeri.buggy },
      deliveryBands: snapshot.jeri.deliveryBands.map((band) => ({
        ...band,
      })),
    },
    localities: {
      prea: Object.entries(snapshot.localities.prea)
        .map(([localityId, pricing]) =>
          localityView(localityId, pricing),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
      jijoca: Object.entries(snapshot.localities.jijoca)
        .map(([localityId, pricing]) =>
          localityView(localityId, pricing),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
    },
    fixedRoutes: snapshot.fixedRoutes.map((route) => ({
      ...route,
    })),
  };
}

export type AdminPricingCatalogView =
  ReturnType<typeof adminPricingCatalogView>;

export type { PricingCatalogSnapshot } from './catalog-snapshot.js';
