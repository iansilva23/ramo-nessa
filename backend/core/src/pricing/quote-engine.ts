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
    default:
      return undefined;
  }
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

  if (request.category === 'comfort_black') {
    const car = localityPrice(catalog.localities.prea, localityId, 'car');
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
      request.period === 'after_22' &&
      catalog.surcharges.preaLocalCarAfter22LocalityIds.includes(localityId)
        ? catalog.surcharges.preaLocalCarAfter22Cents
        : 0;

    return exactQuote(
      `prea-${localityId}-comfort`,
      car + night + catalog.surcharges.preaComfortCents,
      request,
      catalog,
    );
  }

  const value = localityPrice(catalog.localities.prea, localityId, request.category);
  if (value == null) return null;

  if (isBand(value)) {
    return rangeQuote(`prea-${localityId}-${request.category}`, value, request);
  }

  const localCarNight =
    request.category === 'car' &&
    request.period === 'after_22' &&
    catalog.surcharges.preaLocalCarAfter22LocalityIds.includes(localityId)
      ? catalog.surcharges.preaLocalCarAfter22Cents
      : 0;

  return exactQuote(
    `prea-${localityId}-${request.category}`,
    value + localCarNight,
    request,
    catalog,
  );
}

function quoteJijoca(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot,
): FareQuote | null {
  const localityId = resolveHubLocality(
    request.origin,
    request.destination,
    'jijoca',
  );
  if (localityId == null) return null;

  const value = localityPrice(catalog.localities.jijoca, localityId, request.category);
  if (value == null) return null;

  if (isBand(value)) {
    return rangeQuote(
      `jijoca-${localityId}-${request.category}`,
      value,
      request,
    );
  }

  return exactQuote(
    `jijoca-${localityId}-${request.category}`,
    value,
    request,
  );
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
        'Buggy aceita de 1 a 4 passageiros.',
      );
    }

    const base =
      request.period === 'after_22'
        ? catalog.jeri.buggy.after22BaseCents
        : catalog.jeri.buggy.dayBaseCents;
    return exactQuote(
      'jeri-buggy',
      base + passengers * catalog.jeri.buggy.perPassengerCents,
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

    const maxKm = Math.max(
      ...catalog.jeri.deliveryBands.map((candidate) => candidate.maxKm),
    );
    throw new PricingError(
      'UNKNOWN_ROUTE',
      `Entrega acima de ${maxKm} km dentro de Jeri exige regra específica.`,
    );
  }

  return null;
}

export function quoteFare(
  request: QuoteRequest,
  catalog: PricingCatalogSnapshot = STATIC_PRICING_CATALOG_V1,
): FareQuote {
  const fixed = quoteFixedRoute(request, catalog);
  if (fixed != null) return fixed;

  const jeri = quoteJeriLocal(request, catalog);
  if (jeri != null) return jeri;

  const prea = quotePrea(request, catalog);
  if (prea != null) return prea;

  const jijoca = quoteJijoca(request, catalog);
  if (jijoca != null) return jijoca;

  throw new PricingError(
    'UNKNOWN_ROUTE',
    `Não há tarifa v1 para ${endpointId(request.origin)} -> ${endpointId(
      request.destination,
    )} em ${request.category}.`,
  );
}
