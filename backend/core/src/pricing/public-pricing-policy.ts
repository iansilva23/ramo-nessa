import type { PricingCatalogContext } from './effective-catalog.js';

export function publicPricingPolicyView(
  pricing: PricingCatalogContext,
) {
  const snapshot = pricing.snapshot;

  return {
    enabledCategories: snapshot.categories.filter(
      (category) => snapshot.categoryPolicies[category].enabled,
    ),
    enabledZones: snapshot.zones.filter(
      (zoneId) => snapshot.zonePolicies[zoneId].enabled,
    ),
    buggy: {
      minPassengers: snapshot.jeri.buggy.minPassengers,
      maxPassengers: snapshot.jeri.buggy.maxPassengers,
    },
    pricingCatalog: pricing.reference,
  };
}
