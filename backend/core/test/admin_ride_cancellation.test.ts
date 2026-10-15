import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminRideCancellationError,
  cancelRideFromAdmin,
} from '../src/admin/admin-ride-cancellation-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-24T02:30:00.000Z');
const actor = {
  kind: 'user' as const,
  id: 'admin-cancel-test',
  name: 'Admin Cancel Test',
};

function preparedRide(overrides: Partial<RideRecord> = {}): RideRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    passengerId: 'passenger-cancel-test',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-cancel-test',
    driverHoldExpiresAt: '2026-09-24T03:00:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.89860,
    dropoffLongitude: -40.45060,
    origin: { zoneId: 'prea', localityId: 'prea' },
    destination: { zoneId: 'jijoca', localityId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 2,
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

async function walletFinance() {
  const finance = new InMemoryFinanceRepository();
  const topup = await createWalletTopup(finance, {
    passengerId: 'passenger-cancel-test',
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 20000,
    idempotencyKey: 'cancel-topup-001',
    now,
  });
  await finance.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'cancel-topup-event-001',
    capturedAt: now,
  });
  return finance;
}

test('Admin cancela carteira antes da viagem, reembolsa e libera motorista', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const finance = await walletFinance();
  const admin = new InMemoryAdminRepository();
  const prepared = preparedRide();

  const paid = await payRideWithWallet(finance, {
    ride: prepared,
    passengerId: prepared.passengerId,
    idempotencyKey: 'cancel-wallet-payment-001',
    now,
  });
  assert.equal(paid.payment.status, 'paid');
  assert.equal(
    await passengerWalletBalanceCents(finance, prepared.passengerId),
    8000,
  );

  const {
    reservedDriverId: _reservedDriverId,
    driverHoldExpiresAt: _driverHoldExpiresAt,
    ...withoutHold
  } = prepared;
  await rides.create({
    ...withoutHold,
    state: 'DRIVER_ASSIGNED',
    paymentStatus: 'paid',
    driverId: 'driver-cancel-test',
  });
  await drivers.upsert({
    driverId: 'driver-cancel-test',
    vehicleId: 'vehicle-cancel-test',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: true,
    latitude: -2.82017,
    longitude: -40.41467,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const result = await cancelRideFromAdmin({
    rides,
    matching,
    finance,
    admin,
    actor,
    rideId: prepared.id,
    reason: 'Passageiro solicitou cancelamento pelo suporte.',
    now: new Date('2026-09-24T02:31:00.000Z'),
  });

  assert.equal(result.ride.state, 'REFUNDED');
  assert.equal(result.ride.paymentStatus, 'refunded');
  assert.equal(result.payment.status, 'refunded');
  assert.equal(result.refundStatus, 'refunded');
  assert.equal(result.duplicateCancellation, false);
  assert.equal(
    await passengerWalletBalanceCents(finance, prepared.passengerId),
    20000,
  );
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${prepared.id}:escrow`),
    0,
  );
  assert.equal(
    (await drivers.findByDriverId('driver-cancel-test'))?.busy,
    false,
  );

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'ride.cancelled_by_admin');
  assert.equal(audit[0]?.metadata.refundStatus, 'refunded');

  const retry = await cancelRideFromAdmin({
    rides,
    matching,
    finance,
    admin,
    actor,
    rideId: prepared.id,
    reason: 'Replay seguro do cancelamento.',
    now: new Date('2026-09-24T02:32:00.000Z'),
  });
  assert.equal(retry.duplicateCancellation, true);
  assert.equal((await admin.listAudit(10)).length, 1);
});

test('Pix/cartão cancelado fica aguardando estorno do gateway externo', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const finance = new InMemoryFinanceRepository();
  const admin = new InMemoryAdminRepository();

  const pixPrepared = preparedRide({
    id: '22222222-2222-4222-8222-222222222222',
  });
  const {
    reservedDriverId: _pixReservedDriverId,
    driverHoldExpiresAt: _pixDriverHoldExpiresAt,
    ...pixWithoutHold
  } = pixPrepared;
  const ride: RideRecord = {
    ...pixWithoutHold,
    state: 'PAID',
    paymentStatus: 'paid',
  };
  await rides.create(ride);

  await finance.createPayment({
    id: '33333333-3333-4333-8333-333333333333',
    rideId: ride.id,
    method: 'pix',
    processor: 'test-gateway',
    status: 'pending',
    amountCents: ride.quote.totalAmountCents,
    idempotencyKey: 'cancel-pix-payment-001',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await finance.capturePayment({
    paymentId: '33333333-3333-4333-8333-333333333333',
    processorEventId: 'cancel-pix-event-001',
    capturedAt: now,
  });

  const result = await cancelRideFromAdmin({
    rides,
    matching,
    finance,
    admin,
    actor,
    rideId: ride.id,
    reason: 'Falha operacional antes da corrida iniciar.',
    now: new Date('2026-09-24T02:33:00.000Z'),
  });

  assert.equal(result.ride.state, 'REFUND_PENDING');
  assert.equal(result.ride.paymentStatus, 'paid');
  assert.equal(result.payment.status, 'paid');
  assert.equal(result.refundStatus, 'pending_external_gateway');
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    12000,
  );
});

test('Admin não cancela corrida já iniciada sem política de compensação', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const finance = new InMemoryFinanceRepository();
  const admin = new InMemoryAdminRepository();

  const progressPrepared = preparedRide({
    id: '44444444-4444-4444-8444-444444444444',
  });
  const {
    reservedDriverId: _progressReservedDriverId,
    driverHoldExpiresAt: _progressDriverHoldExpiresAt,
    ...progressWithoutHold
  } = progressPrepared;
  const ride: RideRecord = {
    ...progressWithoutHold,
    state: 'IN_PROGRESS',
    paymentStatus: 'paid',
    driverId: 'driver-in-progress',
  };
  await rides.create(ride);

  await assert.rejects(
    () =>
      cancelRideFromAdmin({
        rides,
        matching,
        finance,
        admin,
        actor,
        rideId: ride.id,
        reason: 'Tentativa administrativa em corrida iniciada.',
        now,
      }),
    (error: unknown) =>
      error instanceof AdminRideCancellationError &&
      error.code === 'ADMIN_CANCELLATION_NOT_ALLOWED',
  );

  assert.equal((await rides.findById(ride.id))?.state, 'IN_PROGRESS');
  assert.equal((await admin.listAudit(10)).length, 0);
});
