import {
  type LocalityPricing,
  type PriceBand,
  type PriceValue,
  valueForPeriod,
} from './catalog.v1.js';
import {
  STATIC_PRICING_CATALOG_V1,
  type PricingCatalogSnapshot,
} from './catalog-snapshot.js';
import { categoryEnabled } from './category-eligibility.js';
import { assertCatalogLocationSupported } from './catalog-location-policy.js';
import { splitCommission } from './commission.js';
import {
  PricingError,
  type FareQuote,
  type LocationRef,
  type QuoteRequest,
  type ServiceCategory,
} from './types.js';

function endpointId(location: LocationRef): string {
  return location.localityId ?? location.zoneId;
}

function matchesPair(a: string, b: string, x: string, y: string): boolean {
  return (a === x && b === y) || (a === y && b === x);
}

function isBand(value: PriceValue): value is PriceBand {
  return typeof value !== 'number';
}

function pickupFuelProfile(
  category: ServiceCategory,
  catalog: PricingCatalogSnapshot,
): number | null {
  switch (category) {
    case 'moto':
    case 'delivery':
      return catalog.pickupPolicy.motoReferenceKmPerLiter;
    case 'car':
    case 'comfort_black':
      return catalog.pickupPolicy.carReferenceKmPerLiter;
    case 'buggy':
      return null;
  }
}

export function pickupCompensationCents(
  category: ServiceCategory,
  driverPickupDistanceKm = 0,
  catalog: PricingCatalogSnapshot = STATIC_PRICING_CATALOG_V1,
): number {
  const kmPerLiter = pickupFuelProfile(category, catalog);
  const chargeableKm = Math.max(
    0,
    driverPickupDistanceKm - catalog.pickupPolicy.freeKm,
  );

  if (kmPerLiter == null || chargeableKm <= 0) {
    return 0;
  }

  const rawCents =
    (chargeableKm * catalog.pickupPolicy.fuelPriceCentsPerLiter) /
    kmPerLiter;

  // Regra comercial: compensação simples, arredondada para cima em reais.
  return Math.ceil(rawCents / 100) * 100;
}

function exactQuote(
  ruleId: string,
  baseAmountCents: number,
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote {
  const pickup = pickupCompensationCents(
    request.category,
    request.driverPickupDistanceKm,
    catalog,
  );
  const total = baseAmountCents + pickup;
  const baseSplit = splitCommission(
    baseAmountCents,
    catalog.commissionBps,
  );

  return {
    kind: 'exact',
    ruleId,
    baseAmountCents,
    pickupCompensationCents: pickup,
    totalAmountCents: total,
    platformCommissionCents: baseSplit.platformCommissionCents,
    driverNetCents: baseSplit.driverNetCents + pickup,
  };
}

function rangeQuote(
  ruleId: string,
  value: PriceBand,
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote {
  const pickup = pickupCompensationCents(
    request.category,
    request.driverPickupDistanceKm,
    catalog,
  );
  const minTotal = value.minCents + pickup;
  const maxTotal = value.maxCents + pickup;
  const minBaseSplit = splitCommission(
    value.minCents,
    catalog.commissionBps,
  );
  const maxBaseSplit = splitCommission(
    value.maxCents,
    catalog.commissionBps,
  );

  return {
    kind: 'range',
    ruleId,
    minBaseAmountCents: value.minCents,
    maxBaseAmountCents: value.maxCents,
    pickupCompensationCents: pickup,
    minTotalAmountCents: minTotal,
    maxTotalAmountCents: maxTotal,
    minPlatformCommissionCents:
      minBaseSplit.platformCommissionCents,
    maxPlatformCommissionCents:
      maxBaseSplit.platformCommissionCents,
    minDriverNetCents: minBaseSplit.driverNetCents + pickup,
    maxDriverNetCents: maxBaseSplit.driverNetCents + pickup,
    requiresExactResolution: true,
  };
}

function localityPrice(
  table: Record<string, LocalityPricing>,
  localityId: string,
  category: ServiceCategory,
): PriceValue | undefined {
  const entry = table[localityId];
  if (entry == null) return undefined;

  switch (category) {
    case 'moto':
      return entry.moto;
    case 'delivery':
      return entry.delivery;
    case 'car':
      return entry.car;
    case 'buggy':
      return entry.buggy;
    default:
      return undefined;
  }
}

function localityCategoryEnabled(
  catalog: PricingCatalogSnapshot,
  hub: 'prea' | 'jijoca',
  localityId: string,
  category: ServiceCategory,
): boolean {
  const policy = catalog.localityPolicies[hub][localityId];
  return policy?.enabledCategories.includes(category) === true;
}

function localityNightSurchargeEnabled(
  catalog: PricingCatalogSnapshot,
  localityId: string,
): boolean {
  return (
    catalog.localityPolicies.prea[localityId]
      ?.applyNightSurcharge === true
  );
}

function quoteFixedRoute(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote | null {
  const a = endpointId(request.origin);
  const b = endpointId(request.destination);

  const rule = catalog.fixedRoutes.find(
    (candidate) =>
      candidate.category === request.category &&
      matchesPair(candidate.a, candidate.b, a, b),
  );

  if (rule == null) return null;

  return exactQuote(
    rule.id,
    valueForPeriod(rule.dayCents, rule.after22Cents, request.period),
    request,
    catalog,
  );
}

function quoteDistanceFallback(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote | null {
  const originId = endpointId(request.origin);
  const destinationId = endpointId(request.destination);

  const candidates = catalog.distanceFarePolicies
    .filter(
      (rule) =>
        rule.category === request.category &&
        ((rule.anchorZoneId === request.origin.zoneId &&
          rule.anchorLocalityId === originId) ||
          (rule.anchorZoneId === request.destination.zoneId &&
            rule.anchorLocalityId === destinationId)),
    )
    .sort((a, b) => {
      const aOrigin = a.anchorLocalityId === originId ? 0 : 1;
      const bOrigin = b.anchorLocalityId === originId ? 0 : 1;
      if (aOrigin !== bOrigin) return aOrigin - bOrigin;
      return a.id.localeCompare(b.id);
    });

  if (candidates.length === 0) return null;

  const distance = request.tripDistanceKm;
  if (distance == null) {
    throw new PricingError(
      'MISSING_DISTANCE',
      'A distância roteada da viagem é obrigatória para esta tarifa.',
    );
  }

  const rule = candidates.find(
    (candidate) => distance <= candidate.maxKm,
  );
  if (rule == null) return null;

  const billableKm = Math.max(distance, rule.minKm);
  const distanceAmountCents = Math.ceil(
    billableKm * rule.pricePerKmCents,
  );
  const baseAmountCents = Math.max(
    rule.minimumFareCents,
    distanceAmountCents,
  );

  return exactQuote(
    rule.id,
    baseAmountCents,
    request,
    catalog,
  );
}

function resolveHubLocality(
  origin: LocationRef,
  destination: LocationRef,
  hubId: string,
): string | null {
  const originIsHub =
    origin.localityId === hubId ||
    (origin.zoneId === hubId &&
      origin.localityId == null &&
      destination.zoneId !== hubId);
  const destinationIsHub =
    destination.localityId === hubId ||
    (destination.zoneId === hubId &&
      destination.localityId == null &&
      origin.zoneId !== hubId);

  // Mesma zona sem localidade identificada não pode ser tratada como sede:
  // o GPS pode estar em um interior com tarifa diferente.
  if (
    origin.zoneId === hubId &&
    destination.zoneId === hubId &&
    origin.localityId == null &&
    destination.localityId == null
  ) {
    return null;
  }

  if (originIsHub) {
    if (destination.localityId != null && destination.localityId !== hubId) {
      return destination.localityId;
    }
    if (destination.zoneId !== hubId) {
      return endpointId(destination);
    }
  }

  if (destinationIsHub) {
    if (origin.localityId != null && origin.localityId !== hubId) {
      return origin.localityId;
    }
    if (origin.zoneId !== hubId) {
      return endpointId(origin);
    }
  }

  if (origin.localityId === hubId && destination.localityId === hubId) {
    return hubId;
  }

  return null;
}

function quotePrea(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote | null {
  const localityId = resolveHubLocality(request.origin, request.destination, 'prea');
  if (localityId == null) return null;

  if (request.category === 'buggy' && catalog.commercialPolicy != null) {
    if (!localityCategoryEnabled(catalog, 'prea', localityId, 'buggy')) return null;
    const entry = catalog.localities.prea[localityId];
    const explicitNight = request.period === 'after_22' ? entry?.after22?.buggy : undefined;
    const price = explicitNight ?? entry?.buggy;
    if (typeof price !== 'number') return null;
    const passengers = request.passengers ?? 1;
    return exactQuote(`prea-${localityId}-buggy`, price +
      (request.period === 'after_22' && explicitNight == null ? catalog.commercialPolicy.preaBuggyAfter22Cents : 0) +
      (passengers - 1) * catalog.commercialPolicy.buggyPerAdditionalPassengerCents,
      request, catalog);
  }

  if (request.category === 'comfort_black') {
    if (
      !localityCategoryEnabled(
        catalog,
        'prea',
        localityId,
        'comfort_black',
      )
    ) {
      return null;
    }
    const entry = catalog.localities.prea[localityId];
    const explicitNight = request.period === 'after_22' ? entry?.after22?.car : undefined;
    const car = explicitNight ?? localityPrice(catalog.localities.prea, localityId, 'car');
    if (car == null) return null;
    if (isBand(car)) {
      return rangeQuote(
        `prea-${localityId}-comfort`,
        {
          minCents: car.minCents + catalog.surcharges.preaComfortCents,
          maxCents: car.maxCents + catalog.surcharges.preaComfortCents,
        },
        request,
        catalog,
      );
    }

    const night =
      request.period === 'after_22' && explicitNight == null &&
      localityNightSurchargeEnabled(catalog, localityId)
        ? catalog.surcharges.preaLocalCarAfter22Cents
        : 0;

    return exactQuote(
      `prea-${localityId}-comfort`,
      car + night + catalog.surcharges.preaComfortCents,
      request,
      catalog,
    );
  }

  if (
    request.category !== 'moto' &&
    request.category !== 'delivery' &&
    request.category !== 'car'
  ) {
    return null;
  }
  if (
    !localityCategoryEnabled(
      catalog,
      'prea',
      localityId,
      request.category,
    )
  ) {
    return null;
  }

  const entry = catalog.localities.prea[localityId];
  const value = (request.period === 'after_22' ? entry?.after22?.[request.category] : undefined) ?? localityPrice(catalog.localities.prea, localityId, request.category);
  if (value == null) return null;

  if (isBand(value)) {
    return rangeQuote(
      `prea-${localityId}-${request.category}`,
      value,
      request,
      catalog,
    );
  }

  const localCarNight =
    request.category === 'car' &&
    entry?.after22?.car == null &&
    request.period === 'after_22' &&
    localityNightSurchargeEnabled(catalog, localityId)
      ? catalog.surcharges.preaLocalCarAfter22Cents
      : 0;

  return exactQuote(
    `prea-${localityId}-${request.category}`,
    value + localCarNight,
    request,
    catalog,
  );
}

function quoteJijoca(request: QuoteRequest, catalog: PricingCatalogSnapshot): FareQuote | null {
  const localityId = resolveHubLocality(request.origin, request.destination, 'jijoca');
  if (localityId == null || request.category === 'buggy') return null;
  if (!localityCategoryEnabled(catalog, 'jijoca', localityId, request.category)) return null;
  const category = request.category === 'comfort_black' ? 'car' : request.category;
  if (request.category === 'comfort_black' && catalog.commercialPolicy == null) return null;
  const entry = catalog.localities.jijoca[localityId];
  const explicitNight = request.period === 'after_22' ? entry?.after22?.[category] : undefined;
  const value = explicitNight ?? localityPrice(catalog.localities.jijoca, localityId, category);
  if (value == null) return null;
  if (isBand(value)) return rangeQuote(`jijoca-${localityId}-${request.category}`,value,request,catalog);
  const nightFactor = request.period === 'after_22' && explicitNight == null &&
    catalog.localityPolicies.jijoca[localityId]?.applyNightSurcharge === true
    ? 1 + (catalog.commercialPolicy?.jijocaNightBps ?? 0) / 10000 : 1;
  const comfort = request.category === 'comfort_black' ? catalog.commercialPolicy!.jijocaComfortCents : 0;
  return exactQuote(`jijoca-${localityId}-${request.category}`, Math.round(value * nightFactor) + comfort,request,catalog);
}

function assertApprovedRoute(request: QuoteRequest, catalog: PricingCatalogSnapshot): void {
  const policy = catalog.commercialPolicy;
  if (policy == null) return;
  if (request.category === 'buggy') {
    const passengers = request.passengers ?? 1;
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 4) {
      throw new PricingError('INVALID_PASSENGER_COUNT','Buggy aceita de 1 a 4 passageiros.');
    }
  }
  const originJeri = request.origin.zoneId === 'jericoacoara';
  const destinationJeri = request.destination.zoneId === 'jericoacoara';
  if (!originJeri && !destinationJeri) return;
  const other = endpointId(originJeri ? request.destination : request.origin);
  const local = originJeri && destinationJeri;
  const allowed = local ? ['buggy','delivery'].includes(request.category)
    : (['car','comfort_black'].includes(request.category) && policy.jeriTransferDestinationIds.includes(other)) ||
      (request.category === 'buggy' && other === 'prea');
  if (!allowed) throw new PricingError('UNAVAILABLE_CATEGORY','Esta categoria não opera nesta rota de Jericoacoara.');
}

function quoteRegionalDelivery(request: QuoteRequest, catalog: PricingCatalogSnapshot): FareQuote | null {
  const policy = catalog.commercialPolicy;
  if (policy == null || request.category !== 'delivery' ||
      ![request.origin.zoneId,request.destination.zoneId].some(zone=>zone === 'prea' || zone === 'jijoca')) return null;
  for (const ref of [request.origin, request.destination]) {
    if ((ref.zoneId === 'prea' || ref.zoneId === 'jijoca') && ref.localityId != null &&
        !localityCategoryEnabled(catalog,ref.zoneId,ref.localityId,'delivery')) {
      throw new PricingError('UNAVAILABLE_CATEGORY','Entrega está desativada nesta localidade.');
    }
  }
  if (request.tripDistanceKm == null) throw new PricingError('MISSING_DISTANCE','A distância roteada da retirada até a entrega é obrigatória.');
  return exactQuote('regional-delivery-distance', policy.deliveryBaseCents +
    Math.round(Math.max(0, request.tripDistanceKm-policy.deliveryIncludedKm)*policy.deliveryPerExcessKmCents),request,catalog);
}

function quoteJeriLocal(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote | null {
  if (
    request.origin.zoneId !== 'jericoacoara' ||
    request.destination.zoneId !== 'jericoacoara'
  ) {
    return null;
  }

  if (request.category === 'buggy') {
    const passengers = request.passengers ?? 1;
    if (
      passengers < catalog.jeri.buggy.minPassengers ||
      passengers > catalog.jeri.buggy.maxPassengers ||
      !Number.isInteger(passengers)
    ) {
      throw new PricingError(
        'INVALID_PASSENGER_COUNT',
        `Buggy aceita de ${catalog.jeri.buggy.minPassengers} a ${catalog.jeri.buggy.maxPassengers} passageiros.`,
      );
    }

    const base =
      request.period === 'after_22'
        ? catalog.jeri.buggy.after22BaseCents
        : catalog.jeri.buggy.dayBaseCents;
    const additionalPassengers = Math.max(
      0,
      passengers - catalog.jeri.buggy.minPassengers,
    );
    return exactQuote(
      'jeri-buggy',
      base +
        additionalPassengers *
          catalog.jeri.buggy.perPassengerCents,
      request,
      catalog,
    );
  }

  if (request.category === 'delivery') {
    const distance = request.tripDistanceKm;
    if (distance == null) {
      throw new PricingError(
        'MISSING_DISTANCE',
        'Distância da entrega é obrigatória em Jeri.',
      );
    }

    const band = catalog.jeri.deliveryBands.find(
      (candidate) => distance <= candidate.maxKm,
    );
    if (band != null) {
      return exactQuote(
        `jeri-delivery-${String(band.maxKm).replace('.', '-')}`,
        band.amountCents,
        request,
        catalog,
      );
    }

    return exactQuote(
      'jeri-delivery-above-max',
      catalog.jeri.deliveryAboveMaxCents,
      request,
      catalog,
    );
  }

  return null;
}

export function quoteFare(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot = STATIC_PRICING_CATALOG_V1,
): FareQuote {
  assertCatalogLocationSupported({
    catalog,
    ref: request.origin,
    field: 'origin',
  });
  assertCatalogLocationSupported({
    catalog,
    ref: request.destination,
    field: 'destination',
  });

  if (!categoryEnabled({ catalog, category: request.category })) {
    throw new PricingError(
      'UNAVAILABLE_CATEGORY',
      `Categoria ${request.category} está desativada no catálogo vigente.`,
    );
  }
  assertApprovedRoute(request, catalog);
  const delivery = quoteRegionalDelivery(request, catalog);
  if (delivery != null) return delivery;
  const fixed = quoteFixedRoute(request, catalog);
  if (fixed != null) return fixed;

  const jeri = quoteJeriLocal(request, catalog);
  if (jeri != null) return jeri;

  const prea = quotePrea(request, catalog);
  if (prea != null) return prea;

  const jijoca = quoteJijoca(request, catalog);
  if (jijoca != null) return jijoca;

  const distanceFallback = quoteDistanceFallback(request, catalog);
  if (distanceFallback != null) return distanceFallback;

  throw new PricingError(
    'UNKNOWN_ROUTE',
    `Não há tarifa v1 para ${endpointId(request.origin)} -> ${endpointId(
      request.destination,
    )} em ${request.category}.`,
  );
}
