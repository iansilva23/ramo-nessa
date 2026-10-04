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
  policy: PricingCatalogSnapshot['localityPolicies']['prea'][string] | undefined,
) {
  return {
    localityId,
    prices: {
      moto: priceValueView(pricing.moto),
      delivery: priceValueView(pricing.delivery),
      car: priceValueView(pricing.car),
      buggy: priceValueView(pricing.buggy),
      after22: Object.fromEntries(Object.entries(pricing.after22 ?? {}).map(([category,value])=>[category,priceValueView(value)])),
    },
    policy: {
      enabledCategories: [
        ...(policy?.enabledCategories ?? []),
      ],
      applyNightSurcharge:
        policy?.applyNightSurcharge === true,
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
    commercialPolicy: snapshot.commercialPolicy == null ? null : structuredClone(snapshot.commercialPolicy),
    sharedTransfers: snapshot.sharedTransfers == null ? null : structuredClone(snapshot.sharedTransfers),
    authority: 'core' as const,
    mode: options.mode ?? 'static',
    editable: options.editable ?? false,
    versionId: options.versionId ?? null,
    versionNumber: options.versionNumber ?? null,
    effectiveFrom: options.effectiveFrom ?? null,
    categories: [...snapshot.categories],
    categoryPolicies: snapshot.categories.map((category) => ({
      category,
      enabled: snapshot.categoryPolicies[category].enabled,
      requiresFourByFourOnJeriBoundary:
        snapshot.categoryPolicies[category]
          .requiresFourByFourOnJeriBoundary,
    })),
    periods: [...snapshot.periods],
    zones: [...snapshot.zones],
    zonePolicies: snapshot.zones.map((zoneId) => ({
      zoneId,
      enabled: snapshot.zonePolicies[zoneId].enabled,
    })),
    externalLocalities: [...snapshot.externalLocalities].sort(),
    localityGeofences: snapshot.localityGeofences
      .map((geofence) => ({ ...geofence }))
      .sort((a, b) => {
        const zone = a.zoneId.localeCompare(b.zoneId);
        return zone !== 0
          ? zone
          : a.localityId.localeCompare(b.localityId);
      }),
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
      deliveryAboveMaxCents: snapshot.jeri.deliveryAboveMaxCents,
    },
    localities: {
      prea: Object.entries(snapshot.localities.prea)
        .map(([localityId, pricing]) =>
          localityView(
            localityId,
            pricing,
            snapshot.localityPolicies.prea[localityId],
          ),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
      jijoca: Object.entries(snapshot.localities.jijoca)
        .map(([localityId, pricing]) =>
          localityView(
            localityId,
            pricing,
            snapshot.localityPolicies.jijoca[localityId],
          ),
        )
        .sort((a, b) =>
          a.localityId.localeCompare(b.localityId),
        ),
    },
    distanceFarePolicies: snapshot.distanceFarePolicies
      .map((policy) => ({ ...policy }))
      .sort((a, b) => {
        const anchor = a.anchorLocalityId.localeCompare(
          b.anchorLocalityId,
        );
        return anchor !== 0
          ? anchor
          : a.category.localeCompare(b.category);
      }),
    fixedRoutes: snapshot.fixedRoutes.map((route) => ({
      ...route,
    })),
  };
}

export type AdminPricingCatalogView =
  ReturnType<typeof adminPricingCatalogView>;

export type { PricingCatalogSnapshot } from './catalog-snapshot.js';
