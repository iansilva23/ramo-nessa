import assert from 'node:assert/strict';
import test from 'node:test';

import { publicFareQuoteView } from '../src/pricing/public-fare-view.js';
import {
  passengerRideView,
  publicRideQuoteView,
} from '../src/rides/passenger-ride-view.js';
import type { ExactFare } from '../src/pricing/types.js';
import type { RideRecord } from '../src/rides/ride.js';

test('cotação pública não expõe comissão nem repasse do motorista', () => {
  const quote: ExactFare = {
    kind: 'exact',
    ruleId: 'jeri-prea-car',
    baseAmountCents: 10000,
    pickupCompensationCents: 500,
    totalAmountCents: 10500,
    platformCommissionCents: 1000,
    driverNetCents: 9500,
  };

  const view = publicFareQuoteView(quote);

  assert.equal('platformCommissionCents' in view, false);
  assert.equal('driverNetCents' in view, false);
  assert.equal(view.totalAmountCents, 10500);
});

test('corrida pública do passageiro remove reserva e dados financeiros internos', () => {
  const ride: RideRecord = {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    passengerId: 'passenger-public-view',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-private',
    driverHoldExpiresAt: '2026-09-24T05:00:00.000Z',
    origin: { zoneId: 'jericoacoara' },
    destination: { zoneId: 'prea' },
    category: 'car',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'jeri-prea-car',
      catalogVersion: 'v1',
      catalogVersionId: 'catalog-001',
      catalogVersionNumber: 1,
      baseAmountCents: 10000,
      pickupCompensationCents: 500,
      totalAmountCents: 10500,
      platformCommissionCents: 1000,
      driverNetCents: 9500,
    },
    createdAt: '2026-09-24T04:00:00.000Z',
    updatedAt: '2026-09-24T04:00:00.000Z',
  };

  const quoteView = publicRideQuoteView(ride.quote);
  const rideView = passengerRideView(ride);

  assert.equal('platformCommissionCents' in quoteView, false);
  assert.equal('driverNetCents' in quoteView, false);
  assert.equal('reservedDriverId' in rideView, false);
  assert.equal('platformCommissionCents' in rideView.quote, false);
  assert.equal('driverNetCents' in rideView.quote, false);
  assert.equal(rideView.quote.totalAmountCents, 10500);
  assert.equal(rideView.quote.catalogVersion, 'v1');
});
