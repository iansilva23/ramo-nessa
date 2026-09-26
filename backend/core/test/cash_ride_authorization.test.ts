import assert from 'node:assert/strict';
import test from 'node:test';

import { DriverCashPolicyError } from '../src/payments/cash-policy.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryPaymentPolicySettingsRepository } from '../src/payments/repositories/in-memory-payment-policy-settings-repository.js';
import { authorizeCashRide } from '../src/rides/authorize-cash.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-24T04:00:00.000Z');

function preparedRide(
  overrides: Partial<RideRecord> = {},
): RideRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    passengerId: 'passenger-cash-auth',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-cash-auth',
    driverHoldExpiresAt: '2026-09-24T04:05:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.8,
    dropoffLongitude: -40.51,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 12000,
      pickupCompensationCents: 0,
      totalAmountCents: 12000,
      platformCommissionCents: 1200,
      driverNetCents: 10800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

test('cash desligado nunca autoriza corrida', async () => {
  const rides = new InMemoryRideRepository();
  const settings = new InMemoryPaymentPolicySettingsRepository();
  const finance = new InMemoryFinanceRepository();
  const ride = preparedRide();
  await rides.create(ride);

  await assert.rejects(
    authorizeCashRide({
      rides,
      settings,
      finance,
      rideId: ride.id,
      passengerId: ride.passengerId,
      now,
    }),
    (error: unknown) =>
      error instanceof DriverCashPolicyError &&
      error.code === 'CASH_DISABLED',
  );

  const stored = await rides.findById(ride.id);
  assert.equal(stored?.state, 'AWAITING_PAYMENT');
  assert.equal(stored?.paymentMethod, undefined);
});

test('cash ativo autoriza sem criar pagamento digital', async () => {
  const rides = new InMemoryRideRepository();
  const settings = new InMemoryPaymentPolicySettingsRepository();
  const finance = new InMemoryFinanceRepository();
  const ride = preparedRide();
  await rides.create(ride);
  await settings.setCashEnabled(true, now.toISOString());

  const result = await authorizeCashRide({
    rides,
    settings,
    finance,
    rideId: ride.id,
    passengerId: ride.passengerId,
    now,
  });

  assert.equal(result.duplicateAuthorization, false);
  assert.equal(result.ride.state, 'PAID');
  assert.equal(result.ride.paymentStatus, 'authorized');
  assert.equal(result.ride.paymentMethod, 'cash');
  assert.equal(result.cashPolicy.projectedDebtCents, 1200);
  assert.equal(
    await finance.findLatestPaymentByRideId(ride.id),
    null,
  );

  const replay = await authorizeCashRide({
    rides,
    settings,
    finance,
    rideId: ride.id,
    passengerId: ride.passengerId,
    now: new Date('2026-09-24T04:00:05.000Z'),
  });
  assert.equal(replay.duplicateAuthorization, true);
  assert.equal(replay.ride.paymentMethod, 'cash');
});

test('override individual maior libera motorista acima do limite padrão', async () => {
  const rides = new InMemoryRideRepository();
  const settings = new InMemoryPaymentPolicySettingsRepository();
  const finance = new InMemoryFinanceRepository();
  const ride = preparedRide();
  await rides.create(ride);
  await settings.setCashEnabled(true, now.toISOString());

  await finance.settleCashRide({
    rideId: 'prior-cash-debt',
    driverId: ride.reservedDriverId!,
    platformCommissionCents: 11500,
  });

  await assert.rejects(
    authorizeCashRide({
      rides,
      settings,
      finance,
      rideId: ride.id,
      passengerId: ride.passengerId,
      now,
    }),
    (error: unknown) =>
      error instanceof DriverCashPolicyError &&
      error.code === 'CASH_DEBT_LIMIT_EXCEEDED',
  );

  await settings.setDriverCashDebtLimitOverride(
    ride.reservedDriverId!,
    20000,
    '2026-09-24T04:00:10.000Z',
  );

  const authorized = await authorizeCashRide({
    rides,
    settings,
    finance,
    rideId: ride.id,
    passengerId: ride.passengerId,
    now: new Date('2026-09-24T04:00:11.000Z'),
  });

  assert.equal(authorized.ride.state, 'PAID');
  assert.equal(
    authorized.cashPolicy.effectiveDebtLimitCents,
    20000,
  );
  assert.equal(authorized.cashPolicy.projectedDebtCents, 12700);
});
