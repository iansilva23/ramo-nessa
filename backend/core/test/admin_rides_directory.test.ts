import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeAdminRideDirectoryCursor,
  parseAdminRideDirectoryQuery,
} from '../src/admin/admin-validation.js';
import type { RideRecord } from '../src/rides/ride.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function ride(input: {
  id: string;
  state: RideRecord['state'];
  updatedAt: string;
  createdAt?: string;
  passengerId?: string;
  driverId?: string;
}): RideRecord {
  return {
    id: input.id,
    passengerId:
      input.passengerId ?? 'passenger-admin-rides-test',
    state: input.state,
    paymentStatus: 'paid',
    ...(input.driverId == null
      ? {}
      : { driverId: input.driverId }),
    origin: { zoneId: 'jericoacoara' },
    destination: { zoneId: 'prea' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'admin-rides-test-rule',
      baseAmountCents: 1000,
      pickupCompensationCents: 0,
      totalAmountCents: 1000,
      platformCommissionCents: 100,
      driverNetCents: 900,
    },
    createdAt: input.createdAt ?? '2026-09-23T10:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}

test('diretório Admin de corridas filtra, busca e pagina de forma estável', async () => {
  const repository = new InMemoryRideRepository();
  const rows = [
    ride({
      id: '11111111-1111-4111-8111-111111111111',
      state: 'SEARCHING_DRIVER',
      updatedAt: '2026-09-23T19:00:00.000Z',
      passengerId: 'passenger-rides-a',
    }),
    ride({
      id: '22222222-2222-4222-8222-222222222222',
      state: 'IN_PROGRESS',
      updatedAt: '2026-09-23T20:00:00.000Z',
      passengerId: 'passenger-rides-b',
      driverId: 'driver-rides-b',
    }),
    ride({
      id: '33333333-3333-4333-8333-333333333333',
      state: 'COMPLETED',
      updatedAt: '2026-09-23T21:00:00.000Z',
      passengerId: 'passenger-rides-c',
      driverId: 'driver-rides-c',
    }),
    ride({
      id: '44444444-4444-4444-8444-444444444444',
      state: 'CANCELLED_BY_PASSENGER',
      updatedAt: '2026-09-23T22:00:00.000Z',
      passengerId: 'passenger-rides-d',
    }),
  ];
  for (const row of rows) await repository.create(row);

  const activeStates: RideRecord['state'][] = [
    'PAID',
    'SEARCHING_DRIVER',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'IN_PROGRESS',
  ];

  const first = await repository.listAdmin({
    states: activeStates,
    limit: 1,
  });
  assert.equal(first.hasMore, true);
  assert.deepEqual(
    first.rides.map((item) => item.id),
    ['22222222-2222-4222-8222-222222222222'],
  );

  const last = first.rides[0]!;
  const second = await repository.listAdmin({
    states: activeStates,
    limit: 1,
    cursor: {
      updatedAt: last.updatedAt,
      id: last.id,
    },
  });
  assert.equal(second.hasMore, false);
  assert.deepEqual(
    second.rides.map((item) => item.id),
    ['11111111-1111-4111-8111-111111111111'],
  );

  const completed = await repository.listAdmin({
    states: ['COMPLETED'],
    search: 'driver-rides-c',
    limit: 20,
  });
  assert.deepEqual(
    completed.rides.map((item) => item.id),
    ['33333333-3333-4333-8333-333333333333'],
  );

  const byPassenger = await repository.listAdmin({
    search: 'PASSENGER-RIDES-D',
    limit: 20,
  });
  assert.deepEqual(
    byPassenger.rides.map((item) => item.id),
    ['44444444-4444-4444-8444-444444444444'],
  );
});

test('diretório Admin de corridas filtra histórico por período', async () => {
  const repository = new InMemoryRideRepository();

  await repository.create(
    ride({
      id: '55555555-5555-4555-8555-555555555551',
      state: 'COMPLETED',
      createdAt: '2026-09-20T12:00:00.000Z',
      updatedAt: '2026-09-20T13:00:00.000Z',
    }),
  );
  await repository.create(
    ride({
      id: '55555555-5555-4555-8555-555555555552',
      state: 'COMPLETED',
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T13:00:00.000Z',
    }),
  );

  const page = await repository.listAdmin({
    createdFrom: '2026-09-23T00:00:00.000Z',
    createdTo: '2026-09-23T23:59:59.999Z',
    limit: 20,
  });

  assert.deepEqual(
    page.rides.map((item) => item.id),
    ['55555555-5555-4555-8555-555555555552'],
  );
});

test('query Admin de corridas valida scope, estado, busca e cursor', () => {
  const cursor = encodeAdminRideDirectoryCursor({
    updatedAt: '2026-09-23T20:00:00.000Z',
    id: '22222222-2222-4222-8222-222222222222',
  });

  const active = parseAdminRideDirectoryQuery(
    new URLSearchParams({
      scope: 'active',
      query: 'driver',
      limit: '15',
      cursor,
    }),
  );
  assert.equal(active.limit, 15);
  assert.equal(active.search, 'driver');
  assert.equal(active.states?.includes('IN_PROGRESS'), true);
  assert.equal(active.states?.includes('COMPLETED'), false);
  assert.deepEqual(active.cursor, {
    updatedAt: '2026-09-23T20:00:00.000Z',
    id: '22222222-2222-4222-8222-222222222222',
  });

  const all = parseAdminRideDirectoryQuery(
    new URLSearchParams({ scope: 'all' }),
  );
  assert.equal(all.states, undefined);

  const exact = parseAdminRideDirectoryQuery(
    new URLSearchParams({
      scope: 'active',
      state: 'COMPLETED',
    }),
  );
  assert.deepEqual(exact.states, ['COMPLETED']);

  const dated = parseAdminRideDirectoryQuery(
    new URLSearchParams({
      scope: 'all',
      from: '2026-09-20',
      to: '2026-09-23',
    }),
  );
  assert.equal(
    dated.createdFrom,
    '2026-09-20T00:00:00.000Z',
  );
  assert.equal(
    dated.createdTo,
    '2026-09-23T23:59:59.999Z',
  );

  assert.throws(
    () =>
      parseAdminRideDirectoryQuery(
        new URLSearchParams({
          from: '2026-09-24',
          to: '2026-09-23',
        }),
      ),
    /from não pode ser posterior a to/,
  );

  assert.throws(
    () =>
      parseAdminRideDirectoryQuery(
        new URLSearchParams({ scope: 'unknown' }),
      ),
    /scope deve ser active ou all/,
  );
  assert.throws(
    () =>
      parseAdminRideDirectoryQuery(
        new URLSearchParams({ state: 'INVALID' }),
      ),
    /state de corrida é inválido/,
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL pagina e filtra o diretório Admin de corridas',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresRideRepository(pool);
    const ids = [
      'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaa3',
    ];

    try {
      await repository.create(
        ride({
          id: ids[0]!,
          state: 'SEARCHING_DRIVER',
          updatedAt: '2026-09-23T20:10:00.000Z',
          passengerId: 'passenger-admin-rides-pg-a',
        }),
      );
      await repository.create(
        ride({
          id: ids[1]!,
          state: 'IN_PROGRESS',
          updatedAt: '2026-09-23T20:20:00.000Z',
          passengerId: 'passenger-admin-rides-pg-b',
          driverId: 'driver-admin-rides-pg-b',
        }),
      );
      await repository.create(
        ride({
          id: ids[2]!,
          state: 'COMPLETED',
          updatedAt: '2026-09-23T20:30:00.000Z',
          passengerId: 'passenger-admin-rides-pg-c',
          driverId: 'driver-admin-rides-pg-c',
        }),
      );

      const active = await repository.listAdmin({
        states: [
          'PAID',
          'SEARCHING_DRIVER',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS',
        ],
        search: 'admin-rides-pg',
        limit: 1,
      });
      assert.equal(active.hasMore, true);
      assert.deepEqual(
        active.rides.map((item) => item.id),
        [ids[1]],
      );

      const next = await repository.listAdmin({
        states: [
          'PAID',
          'SEARCHING_DRIVER',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS',
        ],
        search: 'admin-rides-pg',
        limit: 1,
        cursor: {
          updatedAt: active.rides[0]!.updatedAt,
          id: active.rides[0]!.id,
        },
      });
      assert.deepEqual(
        next.rides.map((item) => item.id),
        [ids[0]],
      );

      const completed = await repository.listAdmin({
        states: ['COMPLETED'],
        search: 'driver-admin-rides-pg-c',
        limit: 20,
      });
      assert.deepEqual(
        completed.rides.map((item) => item.id),
        [ids[2]],
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
