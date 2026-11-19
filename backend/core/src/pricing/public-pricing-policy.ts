import { OPERATIONAL_CATEGORIES, rateAvailableForTrip } from './managed-operations.js';
import type { PricingCatalogContext } from './effective-catalog.js';
import { pricingPeriodAt } from './period.js';

export function publicPricingPolicyView(
  pricing: PricingCatalogContext,
  trip?: { originRegionId: string; destinationRegionId: string; at: Date },
) {
  const snapshot = pricing.snapshot;

  const ops = snapshot.managedOperations;
  const usable = ops == null ? null : new Set(ops.rates.filter(rate => {
    const regions = [rate.originRegionId,rate.destinationRegionId].map(id=>ops.regions.find(r=>r.id===id));
    return rate.enabled && !rate.archived && (rate.day != null || rate.night != null) &&
      regions.every(r=>r?.enabled && !r.archived && r.categoryIds.includes(rate.categoryId));
  }).map(r=>r.categoryId));
  const managedCategories = ops?.categories.filter(c => c.enabled && !c.archived &&
    usable?.has(c.id) &&
    OPERATIONAL_CATEGORIES.includes(c.id as typeof OPERATIONAL_CATEGORIES[number]));
  const enabledCategories = snapshot.categories.filter(
    category => snapshot.categoryPolicies[category].enabled && (usable == null || usable.has(category)),
  );
  const availableRouteCategories = trip && ops ? (() => {
    const activeRegion = (id: string) => ops.regions.find(r =>
      r.id === id && r.enabled && !r.archived && snapshot.zonePolicies[r.zoneId].enabled);
    const origin = activeRegion(trip.originRegionId);
    const destination = activeRegion(trip.destinationRegionId);
    if (!origin || !destination) return [];
    const period = pricingPeriodAt(trip.at, snapshot.periodPolicy) === 'day' ? 'day' : 'night';
    const rated = new Set(ops.rates.filter(rate =>
      rateAvailableForTrip(rate, origin.id, destination.id, period)).map(rate => rate.categoryId));
    return managedCategories!.filter(category =>
      enabledCategories.includes(category.id as typeof enabledCategories[number]) &&
      origin.categoryIds.includes(category.id) && destination.categoryIds.includes(category.id) &&
      rated.has(category.id)).map(category => category.id);
  })() : undefined;
  return {
    ...(ops == null ? {} : {
      managementMode: 'managed' as const,
      regions: ops.regions.filter(r=>r.enabled&&!r.archived).map(r=>({...r})),
      categories: managedCategories!.map(c=>({...c})),
    }),
    ...(availableRouteCategories == null ? {} : { availableRouteCategories }),
    sharedTransfers: snapshot.sharedTransfers?.enabled && snapshot.sharedTransfers.whatsappPhone ? structuredClone(snapshot.sharedTransfers) : null,
    localityGeofences: snapshot.localityGeofences.filter(area => snapshot.zonePolicies[area.zoneId].enabled).map(area=>({...area})),
    enabledCategories,
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
