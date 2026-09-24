import { randomUUID } from 'node:crypto';

import { STATIC_PRICING_CATALOG_V1 } from '../pricing/catalog-snapshot.js';
import { requiresFourByFourForTrip } from '../pricing/category-eligibility.js';
import type { PricingCatalogContext } from '../pricing/effective-catalog.js';
import { quoteFare } from '../pricing/quote-engine.js';
import { pricingPeriodAt } from '../pricing/period.js';
import type { QuoteRequest } from '../pricing/types.js';
import { transitionRide } from './ride-state.js';
import { snapshotExactFare, type RideRecord } from './ride.js';
import type { RideRepository } from './ride-repository.js';

export class RideCreationError extends Error {
  constructor(
    public readonly code: 'QUOTE_NOT_EXACT' | 'INVALID_PASSENGER',
    message: string,
  ) {
    super(message);
    this.name = 'RideCreationError';
  }
}

export interface CreateRideInput {
  passengerId: string;
  quoteRequest: QuoteRequest;
  pricing?: PricingCatalogContext;
  now?: Date;
}

export async function createRide(
  repository: RideRepository,
  input: CreateRideInput,
): Promise<RideRecord> {
  const passengerId = input.passengerId.trim();
  if (passengerId.length < 3) {
    throw new RideCreationError(
      'INVALID_PASSENGER',
      'Identidade do passageiro inválida.',
    );
  }

  const now = input.now ?? new Date();
  const authoritativeQuoteRequest: QuoteRequest = {
    ...input.quoteRequest,
    period: pricingPeriodAt(now),
  };

  const pricing =
    input.pricing ?? {
      snapshot: STATIC_PRICING_CATALOG_V1,
      reference: {
        catalogVersion: STATIC_PRICING_CATALOG_V1.catalogVersion,
      },
      version: null,
    };
  const fare = quoteFare(
    authoritativeQuoteRequest,
    pricing.snapshot,
  );
  if (fare.kind !== 'exact') {
    throw new RideCreationError(
      'QUOTE_NOT_EXACT',
      'A corrida só pode ser criada com uma cotação exata.',
    );
  }

  const instant = now.toISOString();

  const ride: RideRecord = {
    id: randomUUID(),
    passengerId,
    state: transitionRide('CREATED', 'AWAITING_PAYMENT'),
    paymentStatus: 'created',

    origin: authoritativeQuoteRequest.origin,
    destination: authoritativeQuoteRequest.destination,
    category: authoritativeQuoteRequest.category,
    requiresFourByFour: requiresFourByFourForTrip({
      catalog: pricing.snapshot,
      category: authoritativeQuoteRequest.category,
      origin: authoritativeQuoteRequest.origin,
      destination: authoritativeQuoteRequest.destination,
    }),
    period: authoritativeQuoteRequest.period,
    passengers: authoritativeQuoteRequest.passengers ?? 1,
    ...(authoritativeQuoteRequest.tripDistanceKm != null
      ? { tripDistanceKm: authoritativeQuoteRequest.tripDistanceKm }
      : {}),
    ...(authoritativeQuoteRequest.driverPickupDistanceKm != null
      ? {
          driverPickupDistanceKm:
            authoritativeQuoteRequest.driverPickupDistanceKm,
        }
      : {}),

    quote: snapshotExactFare(fare, pricing.reference),

    createdAt: instant,
    updatedAt: instant,
  };

  return repository.create(ride);
}
