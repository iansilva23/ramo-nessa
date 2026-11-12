import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateAdminBearer,
  issueAdminApiKey,
} from '../src/admin/admin-auth.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import type { RideRecord } from '../src/rides/ride.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function ride(input: {
  id: string;
  state: RideRecord['state'];
  updatedAt: string;
  passengerId?: string;
  driverId?: string;
}): RideRecord {
  return {
    id: input.id,
    passengerId: input.passengerId ?? 'passenger-dashboard',
    state: input.state,
    paymentStatus: 'paid',
    ...(input.driverId == null ? {} : { driverId: input.driverId }),
    origin: { zoneId: 'jericoacoara' },
    destination: { zoneId: 'prea' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'dashboard-test-rule',
      baseAmountCents: 1000,
      pickupCompensationCents: 0,
      totalAmountCents: 1000,
      platformCommissionCents: 100,
      driverNetCents: 900,
    },
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}

test('escopo rides:read é independente dos demais módulos Admin', async () => {
  const repository = new InMemoryAdminRepository();
  const issued = await issueAdminApiKey({
    repository,
    name: 'Dashboard Operacional',
    scopes: ['rides:read'],
    now: new Date('2026-09-23T18:00:00.000Z'),
  });

  await authenticateAdminBearer({
    repository,
    headers: { authorization: `Bearer ${issued.token}` },
    requiredScope: 'rides:read',
    now: new Date('2026-09-23T18:01:00.000Z'),
  });

  await assert.rejects(() =>
    authenticateAdminBearer({
      repository,
      headers: { authorization: `Bearer ${issued.token}` },
      requiredScope: 'drivers:auth:read',
      now: new Date('2026-09-23T18:01:00.000Z'),
    }),
  );
});

test('dashboard operacional resume e ordena corridas sem inventar estados', async () => {
  const repository = new InMemoryRideRepository();
  const rows = [
    ride({
      id: '11111111-aaaa-4111-8111-111111111111',
      state: 'SEARCHING_DRIVER',
      updatedAt: '2026-09-23T18:10:00.000Z',
    }),
    ride({
      id: '22222222-aaaa-4222-8222-222222222222',
      state: 'DRIVER_ARRIVING',
      updatedAt: '2026-09-23T18:20:00.000Z',
      driverId: 'driver-dashboard-a',
    }),
    ride({
      id: '33333333-aaaa-4333-8333-333333333333',
      state: 'IN_PROGRESS',
      updatedAt: '2026-09-23T18:30:00.000Z',
      driverId: 'driver-dashboard-b',
    }),
    ride({
      id: '44444444-aaaa-4444-8444-444444444444',
      state: 'COMPLETED',
      updatedAt: '2026-09-23T17:00:00.000Z',
      driverId: 'driver-dashboard-c',
    }),
    ride({
      id: '55555555-aaaa-4555-8555-555555555555',
      state: 'CANCELLED_BY_ADMIN',
      updatedAt: '2026-09-23T16:00:00.000Z',
    }),
    ride({
      id: '66666666-aaaa-4666-8666-666666666666',
      state: 'COMPLETED',
      updatedAt: '2026-09-21T10:00:00.000Z',
      driverId: 'driver-dashboard-old',
    }),
  ];

  for (const row of rows) {
    await repository.create(row);
  }

  const summary = await repository.getAdminOperationalSummary(
    '2026-09-22T19:00:00.000Z',
  );
  assert.deepEqual(summary, {
    active: 3,
    searchingDriver: 1,
    driverOnTheWay: 1,
    inProgress: 1,
    completedLast24h: 1,
    cancelledLast24h: 1,
  });

  const active = await repository.listAdminActive(20);
  assert.deepEqual(
    active.map((item) => item.id),
    [
      '33333333-aaaa-4333-8333-333333333333',
      '22222222-aaaa-4222-8222-222222222222',
      '11111111-aaaa-4111-8111-111111111111',
    ],
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL calcula dashboard operacional e lista apenas corridas ativas',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresRideRepository(pool);
    const ids = [
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa3',
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa4',
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa5',
    ];

    try {
      await repository.create(
        ride({
          id: ids[0]!,
          state: 'SEARCHING_DRIVER',
          updatedAt: '2026-09-23T18:10:00.000Z',
          passengerId: 'passenger-dashboard-pg-a',
        }),
      );
      await repository.create(
        ride({
          id: ids[1]!,
          state: 'DRIVER_ARRIVED',
          updatedAt: '2026-09-23T18:20:00.000Z',
          passengerId: 'passenger-dashboard-pg-b',
          driverId: 'driver-dashboard-pg-b',
        }),
      );
      await repository.create(
        ride({
          id: ids[2]!,
          state: 'IN_PROGRESS',
          updatedAt: '2026-09-23T18:30:00.000Z',
          passengerId: 'passenger-dashboard-pg-c',
          driverId: 'driver-dashboard-pg-c',
        }),
      );
      await repository.create(
        ride({
          id: ids[3]!,
          state: 'COMPLETED',
          updatedAt: '2026-09-23T17:00:00.000Z',
          passengerId: 'passenger-dashboard-pg-d',
          driverId: 'driver-dashboard-pg-d',
        }),
      );
      await repository.create(
        ride({
          id: ids[4]!,
          state: 'CANCELLED_BY_PASSENGER',
          updatedAt: '2026-09-23T16:00:00.000Z',
          passengerId: 'passenger-dashboard-pg-e',
        }),
      );

      const summary = await repository.getAdminOperationalSummary(
        '2026-09-22T19:00:00.000Z',
      );

      assert.ok(summary.active >= 3);
      assert.ok(summary.searchingDriver >= 1);
      assert.ok(summary.driverOnTheWay >= 1);
      assert.ok(summary.inProgress >= 1);
      assert.ok(summary.completedLast24h >= 1);
      assert.ok(summary.cancelledLast24h >= 1);

      const active = await repository.listAdminActive(50);
      const own = active.filter((item) => ids.includes(item.id));
      assert.deepEqual(
        own.map((item) => item.id),
        [ids[2], ids[1], ids[0]],
      );
    } finally {
      await pool.query(
        'DELETE FROM rides WHERE id = ANY($1::uuid[])',
        [ids],
      );
      await pool.end();
    }
  },
);
