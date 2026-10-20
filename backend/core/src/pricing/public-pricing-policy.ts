import { OPERATIONAL_CATEGORIES } from './managed-operations.js';
import type { PricingCatalogContext } from './effective-catalog.js';

export function publicPricingPolicyView(
  pricing: PricingCatalogContext,
) {
  const snapshot = pricing.snapshot;

  const ops = snapshot.managedOperations;
  const usable = ops == null ? null : new Set(ops.rates.filter(rate => {
    const regions = [rate.originRegionId,rate.destinationRegionId].map(id=>ops.regions.find(r=>r.id===id));
    return rate.enabled && !rate.archived && (rate.day != null || rate.night != null) &&
      regions.every(r=>r?.enabled && !r.archived && r.categoryIds.includes(rate.categoryId));
  }).map(r=>r.categoryId));
  return {
    ...(ops == null ? {} : {
      regions: ops.regions.filter(r=>r.enabled&&!r.archived).map(r=>({...r})),
      categories: ops.categories.filter(c=>c.enabled&&!c.archived&&usable?.has(c.id)&&OPERATIONAL_CATEGORIES.includes(c.id as typeof OPERATIONAL_CATEGORIES[number])).map(c=>({...c})),
    }),
    sharedTransfers: snapshot.sharedTransfers?.enabled && snapshot.sharedTransfers.whatsappPhone ? structuredClone(snapshot.sharedTransfers) : null,
    localityGeofences: snapshot.localityGeofences.filter(area => snapshot.zonePolicies[area.zoneId].enabled).map(area=>({...area})),
    enabledCategories: snapshot.categories.filter(
      (category) => snapshot.categoryPolicies[category].enabled && (usable == null || usable.has(category)),
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
