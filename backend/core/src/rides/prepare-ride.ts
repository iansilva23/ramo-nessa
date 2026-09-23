import { randomUUID } from 'node:crypto';

import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import { rankEligibleDrivers, type GeoPoint } from '../matching/select-driver.js';
import { quoteFare } from '../pricing/quote-engine.js';
import { pricingPeriodAt } from '../pricing/period.js';
import type { QuoteRequest } from '../pricing/types.js';
import {
  RoutingDistanceError,
  type RoutingDistanceProvider,
} from '../routing/distance-provider.js';
import { transitionRide } from './ride-state.js';
import { snapshotExactFare, type RideRecord } from './ride.js';
import {
  RidePreparationRepositoryError,
  type RidePreparationRepository,
} from './ride-preparation-repository.js';

export const DEFAULT_DRIVER_PAYMENT_HOLD_SECONDS = 90;

export class RidePreparationError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PASSENGER'
      | 'QUOTE_NOT_EXACT'
      | 'NO_ELIGIBLE_DRIVER'
      | 'ROUTING_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'RidePreparationError';
  }
}

export async function prepareRideForPayment(input: {
  repository: RidePreparationRepository;
  drivers: DriverSupplyRepository;
  routing: RoutingDistanceProvider;
  passengerId: string;
  quoteRequest: QuoteRequest;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  now?: Date;
  holdSeconds?: number;
  maxCandidates?: number;
}): Promise<RideRecord> {
  const passengerId = input.passengerId.trim();
  if (passengerId.length < 3) {
    throw new RidePreparationError(
      'INVALID_PASSENGER',
      'Identidade do passageiro inválida.',
    );
  }

  const holdSeconds =
    input.holdSeconds ?? DEFAULT_DRIVER_PAYMENT_HOLD_SECONDS;
  if (
    !Number.isInteger(holdSeconds) ||
    holdSeconds < 30 ||
    holdSeconds > 300
  ) {
    throw new Error('holdSeconds deve ficar entre 30 e 300.');
  }

  const now = input.now ?? new Date();

  // Nunca confiar em horário, distância da viagem ou distância de coleta
  // enviados pelo cliente quando qualquer um deles altera dinheiro.
  const {
    driverPickupDistanceKm: _ignoredClientPickupDistance,
    tripDistanceKm: _ignoredClientTripDistance,
    period: _ignoredClientPeriod,
    ...clientQuoteRequest
  } = input.quoteRequest;

  const needsTripDistance =
    clientQuoteRequest.category === 'delivery' &&
    clientQuoteRequest.origin.zoneId === 'jericoacoara' &&
    clientQuoteRequest.destination.zoneId === 'jericoacoara';

  let authoritativeTripDistanceKm: number | undefined;
  if (needsTripDistance) {
    try {
      authoritativeTripDistanceKm = await input.routing.routeDistanceKm({
        from: input.pickup,
        to: input.dropoff,
      });
    } catch (error) {
      if (error instanceof RoutingDistanceError) {
        throw new RidePreparationError(
          'ROUTING_UNAVAILABLE',
          'Não foi possível calcular a distância segura da viagem.',
        );
      }
      throw error;
    }
  }

  const trustedQuoteRequest: QuoteRequest = {
    ...clientQuoteRequest,
    period: pricingPeriodAt(now),
    ...(authoritativeTripDistanceKm != null
      ? { tripDistanceKm: authoritativeTripDistanceKm }
      : {}),
  };

  const baseFare = quoteFare(trustedQuoteRequest);
  if (baseFare.kind !== 'exact') {
    throw new RidePreparationError(
      'QUOTE_NOT_EXACT',
      'A corrida só pode ser preparada com tarifa-base exata.',
    );
  }

  const instant = now.toISOString();
  const rideId = randomUUID();
  const provisionalRide: RideRecord = {
    id: rideId,
    passengerId,
    state: transitionRide('CREATED', 'AWAITING_PAYMENT'),
    paymentStatus: 'created',
    pickupLatitude: input.pickup.latitude,
    pickupLongitude: input.pickup.longitude,
    dropoffLatitude: input.dropoff.latitude,
    dropoffLongitude: input.dropoff.longitude,
    origin: trustedQuoteRequest.origin,
    destination: trustedQuoteRequest.destination,
    category: trustedQuoteRequest.category,
    period: trustedQuoteRequest.period,
    passengers: trustedQuoteRequest.passengers ?? 1,
    ...(trustedQuoteRequest.tripDistanceKm != null
      ? { tripDistanceKm: trustedQuoteRequest.tripDistanceKm }
      : {}),
    quote: snapshotExactFare(baseFare),
    createdAt: instant,
    updatedAt: instant,
  };

  const ranked = rankEligibleDrivers({
    ride: provisionalRide,
    pickup: input.pickup,
    candidates: await input.drivers.listOnline(),
    now,
  }).slice(0, Math.max(1, input.maxCandidates ?? 5));

  if (ranked.length === 0) {
    throw new RidePreparationError(
      'NO_ELIGIBLE_DRIVER',
      'Nenhum motorista elegível disponível para preparar a corrida.',
    );
  }

  let hadRoutingFailure = false;
  for (const candidate of ranked) {
    let routedPickupKm: number;
    try {
      routedPickupKm = await input.routing.routeDistanceKm({
        from: {
          latitude: candidate.supply.latitude,
          longitude: candidate.supply.longitude,
        },
        to: input.pickup,
      });
    } catch (error) {
      if (error instanceof RoutingDistanceError) {
        hadRoutingFailure = true;
        continue;
      }
      throw error;
    }

    const finalFare = quoteFare({
      ...trustedQuoteRequest,
      driverPickupDistanceKm: routedPickupKm,
    });
    if (finalFare.kind !== 'exact') {
      throw new RidePreparationError(
        'QUOTE_NOT_EXACT',
        'A tarifa final da corrida não ficou exata.',
      );
    }

    const holdExpiresAt = new Date(
      now.getTime() + holdSeconds * 1000,
    ).toISOString();

    const preparedRide: RideRecord = {
      ...provisionalRide,
      reservedDriverId: candidate.supply.driverId,
      driverHoldExpiresAt: holdExpiresAt,
      driverPickupDistanceKm: routedPickupKm,
      quote: snapshotExactFare(finalFare),
    };

    try {
      return await input.repository.reserveDriverAndCreateRide({
        ride: preparedRide,
        preparedAt: instant,
      });
    } catch (error) {
      if (
        error instanceof RidePreparationRepositoryError &&
        error.code === 'DRIVER_NOT_AVAILABLE'
      ) {
        continue;
      }
      throw error;
    }
  }

  if (hadRoutingFailure) {
    throw new RidePreparationError(
      'ROUTING_UNAVAILABLE',
      'Não foi possível calcular a coleta roteada dos motoristas disponíveis.',
    );
  }

  throw new RidePreparationError(
    'NO_ELIGIBLE_DRIVER',
    'Os motoristas elegíveis ficaram indisponíveis durante a preparação.',
  );
}
