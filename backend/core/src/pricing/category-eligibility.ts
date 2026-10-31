import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import type {
  LocationRef,
  ServiceCategory,
} from './types.js';

export function categoryEnabled(input: {
  catalog: PricingCatalogSnapshot;
  category: ServiceCategory;
}): boolean {
  return input.catalog.categoryPolicies[input.category]?.enabled === true;
}

export function requiresFourByFourForTrip(input: {
  catalog: PricingCatalogSnapshot;
  category: ServiceCategory;
  origin: LocationRef;
  destination: LocationRef;
}): boolean {
  const originIsJeri = input.origin.zoneId === 'jericoacoara';
  const destinationIsJeri =
    input.destination.zoneId === 'jericoacoara';

  if (input.catalog.managedOperations != null) {
    return (originIsJeri || destinationIsJeri) &&
      input.catalog.categoryPolicies[input.category]?.requiresFourByFourOnJeriBoundary === true;
  }
  if (originIsJeri === destinationIsJeri) return false;

  return input.catalog.categoryPolicies[input.category]
    .requiresFourByFourOnJeriBoundary;
}
