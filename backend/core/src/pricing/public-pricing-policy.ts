import type { PricingCatalogContext } from './effective-catalog.js';

export function publicPricingPolicyView(
  pricing: PricingCatalogContext,
) {
  const snapshot = pricing.snapshot;

  return {
    sharedTransfers: snapshot.sharedTransfers?.enabled && snapshot.sharedTransfers.whatsappPhone ? structuredClone(snapshot.sharedTransfers) : null,
    localityGeofences: snapshot.localityGeofences.filter(area => snapshot.zonePolicies[area.zoneId].enabled).map(area=>({...area})),
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
          sharedTransfers: snapshot.sharedTransfers?.enabled && snapshot.sharedTransfers.whatsappPhone ? structuredClone(snapshot.sharedTransfers) : null,
    localityGeofences: snapshot.localityGeofences.filter(area => snapshot.zonePolicies[area.zoneId].enabled).map(area=>({...area})),
    enabledCategories: [...policy.enabledCategories],
        }))
        .sort((a, b) => a.localityId.localeCompare(b.localityId)),
      jijoca: Object.entries(snapshot.localityPolicies.jijoca)
        .map(([localityId, policy]) => ({
          localityId,
          sharedTransfers: snapshot.sharedTransfers?.enabled && snapshot.sharedTransfers.whatsappPhone ? structuredClone(snapshot.sharedTransfers) : null,
    localityGeofences: snapshot.localityGeofences.filter(area => snapshot.zonePolicies[area.zoneId].enabled).map(area=>({...area})),
    enabledCategories: [...policy.enabledCategories],
        }))
        .sort((a, b) => a.localityId.localeCompare(b.localityId)),
    },
    pricingCatalog: pricing.reference,
  };
}
