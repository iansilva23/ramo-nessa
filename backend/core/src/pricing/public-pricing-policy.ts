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
    localityPolicies: {
      prea: Object.entries(snapshot.localityPolicies.prea)
        .map(([localityId, policy]) => ({
          localityId,
          enabledCategories: [...policy.enabledCategories],
        }))
        .sort((a, b) => a.localityId.localeCompare(b.localityId)),
      jijoca: Object.entries(snapshot.localityPolicies.jijoca)
        .map(([localityId, policy]) => ({
          localityId,
          enabledCategories: [...policy.enabledCategories],
        }))
        .sort((a, b) => a.localityId.localeCompare(b.localityId)),
    },
    pricingCatalog: pricing.reference,
  };
}
