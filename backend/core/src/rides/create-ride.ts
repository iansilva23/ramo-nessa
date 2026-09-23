import { randomUUID } from 'node:crypto';

import { quoteFare } from '../pricing/quote-engine.js';
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

  const fare = quoteFare(input.quoteRequest);
  if (fare.kind !== 'exact') {
    throw new RideCreationError(
      'QUOTE_NOT_EXACT',
      'A corrida só pode ser criada com uma cotação exata.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();

  const ride: RideRecord = {
    id: randomUUID(),
    passengerId,
    state: transitionRide('CREATED', 'AWAITING_PAYMENT'),
    paymentStatus: 'created',

    origin: input.quoteRequest.origin,
    destination: input.quoteRequest.destination,
    category: input.quoteRequest.category,
    period: input.quoteRequest.period,
    passengers: input.quoteRequest.passengers ?? 1,
    ...(input.quoteRequest.tripDistanceKm != null
      ? { tripDistanceKm: input.quoteRequest.tripDistanceKm }
      : {}),
    ...(input.quoteRequest.driverPickupDistanceKm != null
      ? { driverPickupDistanceKm: input.quoteRequest.driverPickupDistanceKm }
      : {}),

    quote: snapshotExactFare(fare),

    createdAt: instant,
    updatedAt: instant,
  };

  return repository.create(ride);
}
