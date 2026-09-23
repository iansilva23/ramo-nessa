import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeAdminDriverDirectoryCursor,
  parseAdminDriverDirectoryQuery,
} from '../src/admin/admin-validation.js';
import type {
  AuthIdentityRecord,
} from '../src/auth/auth-otp-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function identity(input: {
  id: string;
  subjectId: string;
  phone: string;
  status: 'active' | 'suspended';
  updatedAt: string;
  subjectType?: 'driver' | 'passenger';
}): AuthIdentityRecord {
  return {
    id: input.id,
    subjectId: input.subjectId,
    subjectType: input.subjectType ?? 'driver',
    phoneE164: input.phone,
    status: input.status,
    createdAt: '2026-09-23T12:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}

test('diretório de motoristas ordena, pagina, busca e conta estados', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const rows = [
    identity({
      id: '11111111-1111-4111-8111-111111111111',
      subjectId: 'driver-alpha',
      phone: '+5588999991201',
      status: 'active',
      updatedAt: '2026-09-23T15:00:00.000Z',
    }),
    identity({
      id: '22222222-2222-4222-8222-222222222222',
      subjectId: 'driver-beta',
      phone: '+5588999991202',
      status: 'suspended',
      updatedAt: '2026-09-23T16:00:00.000Z',
    }),
    identity({
      id: '33333333-3333-4333-8333-333333333333',
      subjectId: 'driver-gamma',
      phone: '+5588999991203',
      status: 'active',
      updatedAt: '2026-09-23T17:00:00.000Z',
    }),
    identity({
      id: '44444444-4444-4444-8444-444444444444',
      subjectId: 'passenger-ignore',
      phone: '+5588999991204',
      status: 'active',
      updatedAt: '2026-09-23T18:00:00.000Z',
      subjectType: 'passenger',
    }),
  ];
  for (const row of rows) {
    await repository.createIdentity(row);
  }

  const first = await repository.listIdentities({
    subjectType: 'driver',
    limit: 2,
  });
  assert.equal(first.hasMore, true);
  assert.deepEqual(
    first.identities.map((item) => item.subjectId),
    ['driver-gamma', 'driver-beta'],
  );

  const last = first.identities[1]!;
  const second = await repository.listIdentities({
    subjectType: 'driver',
    limit: 2,
    cursor: {
      updatedAt: last.updatedAt,
      id: last.id,
    },
  });
  assert.equal(second.hasMore, false);
  assert.deepEqual(
    second.identities.map((item) => item.subjectId),
    ['driver-alpha'],
  );

  const filtered = await repository.listIdentities({
    subjectType: 'driver',
    status: 'active',
    search: 'GAMMA',
    limit: 20,
  });
  assert.deepEqual(
    filtered.identities.map((item) => item.subjectId),
    ['driver-gamma'],
  );

  const phoneSearch = await repository.listIdentities({
    subjectType: 'driver',
    search: '1202',
    limit: 20,
  });
  assert.deepEqual(
    phoneSearch.identities.map((item) => item.subjectId),
    ['driver-beta'],
  );

  assert.deepEqual(
    await repository.countIdentitiesByStatus('driver'),
    {
      total: 3,
      active: 2,
      suspended: 1,
    },
  );
});

test('query administrativa valida filtro, limite e cursor opaco', () => {
  const cursor = encodeAdminDriverDirectoryCursor({
    updatedAt: '2026-09-23T17:00:00.000Z',
    id: '33333333-3333-4333-8333-333333333333',
  });
  const parsed = parseAdminDriverDirectoryQuery(
    new URLSearchParams({
      status: 'active',
      query: 'driver',
      limit: '15',
      cursor,
    }),
  );

  assert.deepEqual(parsed, {
    status: 'active',
    search: 'driver',
    limit: 15,
    cursor: {
      updatedAt: '2026-09-23T17:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
    },
  });

  assert.throws(
    () =>
      parseAdminDriverDirectoryQuery(
        new URLSearchParams({ status: 'pending' }),
      ),
    /status deve ser active ou suspended/,
  );
  assert.throws(
    () =>
      parseAdminDriverDirectoryQuery(
        new URLSearchParams({ cursor: 'not-valid!' }),
      ),
    /cursor é inválido/,
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL lista e resume somente identidades de motorista',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresAuthOtpRepository(pool);
    const ids = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    ];

    try {
      await repository.createIdentity(
        identity({
          id: ids[0]!,
          subjectId: 'driver-directory-pg-a',
          phone: '+5588999991271',
          status: 'active',
          updatedAt: '2026-09-23T18:00:00.000Z',
        }),
      );
      await repository.createIdentity(
        identity({
          id: ids[1]!,
          subjectId: 'driver-directory-pg-b',
          phone: '+5588999991272',
          status: 'suspended',
          updatedAt: '2026-09-23T18:01:00.000Z',
        }),
      );
      await repository.createIdentity(
        identity({
          id: ids[2]!,
          subjectId: 'driver-directory-pg-c',
          phone: '+5588999991273',
          status: 'active',
          updatedAt: '2026-09-23T18:02:00.000Z',
        }),
      );
      await repository.createIdentity(
        identity({
          id: ids[3]!,
          subjectId: 'passenger-directory-ignore',
          phone: '+5588999991274',
          status: 'active',
          updatedAt: '2026-09-23T18:03:00.000Z',
          subjectType: 'passenger',
        }),
      );

      const page = await repository.listIdentities({
        subjectType: 'driver',
        search: 'directory-pg',
        limit: 2,
      });
      assert.equal(page.hasMore, true);
      assert.deepEqual(
        page.identities.map((item) => item.subjectId),
        ['driver-directory-pg-c', 'driver-directory-pg-b'],
      );

      const active = await repository.listIdentities({
        subjectType: 'driver',
        status: 'active',
        search: '127',
        limit: 20,
      });
      assert.deepEqual(
        active.identities.map((item) => item.subjectId).sort(),
        ['driver-directory-pg-a', 'driver-directory-pg-c'],
      );

      const counts =
        await repository.countIdentitiesByStatus('driver');
      assert.ok(counts.total >= 3);
      assert.ok(counts.active >= 2);
      assert.ok(counts.suspended >= 1);
    } finally {
      await pool.query(
        'DELETE FROM auth_identities WHERE id = ANY($1::uuid[])',
        [ids],
      );
      await pool.end();
    }
  },
);
