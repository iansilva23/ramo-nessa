import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import {
  createFullyPromotionalPayment,
  PromotionError,
} from '../src/promotions/promotion-service.js';
import {
  PromotionRepositoryError,
  type PromotionRedemptionRecord,
} from '../src/promotions/promotion-repository.js';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = '2026-10-01T05:00:00.000Z';

function redemption(input: {
  id: string;
  campaignId: string;
  passengerId?: string;
  deviceHash?: string;
  rideId?: string;
}): PromotionRedemptionRecord {
  return {
    id: input.id,
    campaignId: input.campaignId,
    passengerId: input.passengerId ?? 'passenger-promo',
    deviceHash: input.deviceHash ?? 'device-promo',
    ...(input.rideId == null ? {} : { rideId: input.rideId }),
    referenceKey: `ref:${input.id}`,
    status: 'reserved',
    normalTotalCents: 20000,
    discountCents: 5000,
    passengerPayableCents: 15000,
    driverEarningsCents: 18000,
    expiresAt: '2026-10-01T05:05:00.000Z',
    createdAt: now,
    updatedAt: now,
  };
}

test('troca que falha por limite preserva a reserva anterior', async () => {
  const repository = new InMemoryPromotionRepository();
  const rideId = 'ride-promo-swap-failure';
  const previous = redemption({
    id: 'use-old',
    campaignId: 'campaign-old',
    rideId,
  });
  await repository.reserveRedemption({
    redemption: previous,
    maxRedemptions: 10,
    perPassengerLimit: 10,
    perDeviceLimit: 10,
    now,
  });

  await repository.reserveRedemption({
    redemption: redemption({
      id: 'use-blocker',
      campaignId: 'campaign-new',
      passengerId: 'other-passenger',
      deviceHash: 'other-device',
    }),
    maxRedemptions: 10,
    perPassengerLimit: 10,
    perDeviceLimit: 10,
    now,
  });

  await assert.rejects(
    repository.reserveRedemption({
      redemption: redemption({
        id: 'use-new',
        campaignId: 'campaign-new',
        rideId,
      }),
      maxRedemptions: 1,
      perPassengerLimit: 10,
      perDeviceLimit: 10,
      now,
      replaceRedemptionId: previous.id,
    }),
    (error: unknown) =>
      error instanceof PromotionRepositoryError &&
      error.code === 'PROMOTION_LIMIT_REACHED',
  );

  assert.equal(
    (await repository.findRedemptionById(previous.id))?.status,
    'reserved',
  );
  assert.equal(
    (await repository.findRedemptionByRideId(rideId))?.id,
    previous.id,
  );
});

test('troca válida libera a reserva anterior somente após reservar a nova', async () => {
  const repository = new InMemoryPromotionRepository();
  const rideId = 'ride-promo-swap-success';
  const previous = redemption({
    id: 'use-old-success',
    campaignId: 'campaign-old',
    rideId,
  });
  await repository.reserveRedemption({
    redemption: previous,
    maxRedemptions: 10,
    perPassengerLimit: 10,
    perDeviceLimit: 10,
    now,
  });

  const next = await repository.reserveRedemption({
    redemption: redemption({
      id: 'use-new-success',
      campaignId: 'campaign-new',
      rideId,
    }),
    maxRedemptions: 10,
    perPassengerLimit: 10,
    perDeviceLimit: 10,
    now,
    replaceRedemptionId: previous.id,
  });

  assert.equal(next.status, 'reserved');
  assert.equal(
    (await repository.findRedemptionById(previous.id))?.status,
    'released',
  );
  assert.equal(
    (await repository.findRedemptionByRideId(rideId))?.id,
    next.id,
  );
});

function freeRide(holdExpiresAt: string): RideRecord {
  const quote = {
    ruleId: 'promo-free-test',
    baseAmountCents: 20000,
    pickupCompensationCents: 0,
    totalAmountCents: 20000,
    platformCommissionCents: 2000,
    driverNetCents: 18000,
  };
  return {
    id: 'ride-free-expired',
    passengerId: 'passenger-free-expired',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-free-expired',
    driverHoldExpiresAt: holdExpiresAt,
    pickupLatitude: -2.8,
    pickupLongitude: -40.4,
    dropoffLatitude: -2.9,
    dropoffLongitude: -40.5,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jeri' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote,
    promotion: {
      campaignId: 'campaign-free',
      applicationId: 'use-free',
      code: 'FREE100',
      name: 'Corrida grátis',
      kind: 'free_ride',
      normalTotalCents: 20000,
      discountCents: 20000,
      passengerPayableCents: 0,
      driverEarningsCents: 18000,
      originalQuote: structuredClone(quote),
    },
    createdAt: now,
    updatedAt: now,
  };
}

test('confirmação promocional zero rejeita hold expirado no Core', async () => {
  const finance = new InMemoryFinanceRepository();
  const ride = freeRide('2026-10-01T04:59:59.000Z');

  await assert.rejects(
    createFullyPromotionalPayment({
      finance,
      ride,
      now: new Date(now),
    }),
    (error: unknown) =>
      error instanceof PromotionError &&
      error.code === 'PROMOTION_RIDE_STATE_INVALID',
  );

  assert.equal(
    await finance.findLatestPaymentByRideId(ride.id),
    null,
  );
});
