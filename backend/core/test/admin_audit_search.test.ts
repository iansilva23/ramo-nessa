import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeAdminAuditCursor,
  InvalidAdminRequestError,
  parseAdminAuditQuery,
} from '../src/admin/admin-validation.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const userActor = {
  kind: 'user' as const,
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Operador Humano',
};

const keyActor = {
  kind: 'api_key' as const,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Storage API',
};

test('auditoria filtra e pagina por cursor estável', async () => {
  const repository = new InMemoryAdminRepository();

  for (const record of [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      actor: userActor,
      action: 'passenger.auth.status_changed',
      targetType: 'passenger',
      targetId: 'passenger-a',
      metadata: { status: 'suspended' },
      createdAt: '2026-09-24T01:01:00.000Z',
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      actor: userActor,
      action: 'passenger.auth.status_changed',
      targetType: 'passenger',
      targetId: 'passenger-a',
      metadata: { status: 'active' },
      createdAt: '2026-09-24T01:02:00.000Z',
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      actor: keyActor,
      action: 'driver.document.submitted',
      targetType: 'driver',
      targetId: 'driver-a',
      metadata: {},
      createdAt: '2026-09-24T01:03:00.000Z',
    },
  ]) {
    await repository.appendAudit(record);
  }

  const first = await repository.searchAudit({
    limit: 1,
    actorKind: 'user',
    action: 'passenger.auth.status_changed',
    targetType: 'passenger',
    search: 'passenger-a',
  });

  assert.equal(first.records.length, 1);
  assert.equal(first.records[0]?.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  assert.equal(first.hasMore, true);

  const cursorRecord = first.records[0]!;
  const second = await repository.searchAudit({
    limit: 1,
    actorKind: 'user',
    action: 'passenger.auth.status_changed',
    targetType: 'passenger',
    search: 'passenger-a',
    cursor: {
      createdAt: cursorRecord.createdAt,
      id: cursorRecord.id,
    },
  });

  assert.equal(second.records.length, 1);
  assert.equal(second.records[0]?.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  assert.equal(second.hasMore, false);
});

test('query de auditoria valida filtros e decodifica cursor', () => {
  const cursor = encodeAdminAuditCursor({
    createdAt: '2026-09-24T01:02:00.000Z',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  });

  const query = parseAdminAuditQuery(
    new URLSearchParams({
      limit: '25',
      actorKind: 'user',
      action: 'passenger.auth.status_changed',
      targetType: 'passenger',
      query: 'passenger-a',
      cursor,
    }),
  );

  assert.deepEqual(query, {
    limit: 25,
    actorKind: 'user',
    action: 'passenger.auth.status_changed',
    targetType: 'passenger',
    search: 'passenger-a',
    cursor: {
      createdAt: '2026-09-24T01:02:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    },
  });

  assert.throws(
    () =>
      parseAdminAuditQuery(
        new URLSearchParams({ actorKind: 'robot' }),
      ),
    (error: unknown) =>
      error instanceof InvalidAdminRequestError,
  );
});


const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL mantém paridade de filtros e cursor da auditoria',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresAdminRepository(pool);
    const keyId = randomUUID();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const unrelatedId = randomUUID();
    const percentLiteralId = randomUUID();
    const percentWildcardId = randomUUID();
    const underscoreLiteralId = randomUUID();
    const underscoreWildcardId = randomUUID();
    const actor = {
      kind: 'api_key' as const,
      id: keyId,
      name: 'Audit Search CI',
    };

    try {
      await repository.createApiKey({
        id: keyId,
        name: actor.name,
        tokenHash: 'audit-search-' + randomUUID(),
        scopes: ['audit:read'],
        expiresAt: '2026-10-27T00:00:00.000Z',
        createdAt: '2026-09-27T00:00:00.000Z',
      });

      await repository.appendAudit({
        id: firstId,
        actor,
        action: 'audit.search.parity',
        targetType: 'audit_test',
        targetId: 'needle-older',
        metadata: { order: 1 },
        createdAt: '2026-09-27T00:01:00.000Z',
      });
      await repository.appendAudit({
        id: secondId,
        actor,
        action: 'audit.search.parity',
        targetType: 'audit_test',
        targetId: 'needle-newer',
        metadata: { order: 2 },
        createdAt: '2026-09-27T00:02:00.000Z',
      });
      await repository.appendAudit({
        id: unrelatedId,
        actor,
        action: 'audit.search.other',
        targetType: 'audit_test',
        targetId: 'needle-unrelated',
        metadata: {},
        createdAt: '2026-09-27T00:03:00.000Z',
      });
      await repository.appendAudit({
        id: percentLiteralId,
        actor,
        action: 'audit.search.literal',
        targetType: 'audit_test',
        targetId: 'literal%match',
        metadata: {},
        createdAt: '2026-09-27T00:04:00.000Z',
      });
      await repository.appendAudit({
        id: percentWildcardId,
        actor,
        action: 'audit.search.literal',
        targetType: 'audit_test',
        targetId: 'literalXmatch',
        metadata: {},
        createdAt: '2026-09-27T00:05:00.000Z',
      });
      await repository.appendAudit({
        id: underscoreLiteralId,
        actor,
        action: 'audit.search.literal',
        targetType: 'audit_test',
        targetId: 'literal_match',
        metadata: {},
        createdAt: '2026-09-27T00:06:00.000Z',
      });
      await repository.appendAudit({
        id: underscoreWildcardId,
        actor,
        action: 'audit.search.literal',
        targetType: 'audit_test',
        targetId: 'literal-match',
        metadata: {},
        createdAt: '2026-09-27T00:07:00.000Z',
      });

      const first = await repository.searchAudit({
        limit: 1,
        actorKind: 'api_key',
        action: 'audit.search.parity',
        targetType: 'audit_test',
        search: 'needle',
      });

      assert.equal(first.records.length, 1);
      assert.equal(first.records[0]?.id, secondId);
      assert.equal(first.hasMore, true);

      const cursorRecord = first.records[0]!;
      const second = await repository.searchAudit({
        limit: 1,
        actorKind: 'api_key',
        action: 'audit.search.parity',
        targetType: 'audit_test',
        search: 'needle',
        cursor: {
          createdAt: cursorRecord.createdAt,
          id: cursorRecord.id,
        },
      });

      assert.equal(second.records.length, 1);
      assert.equal(second.records[0]?.id, firstId);
      assert.equal(second.hasMore, false);

      const percentLiteral = await repository.searchAudit({
        limit: 10,
        actorKind: 'api_key',
        action: 'audit.search.literal',
        targetType: 'audit_test',
        search: 'literal%match',
      });
      assert.deepEqual(
        percentLiteral.records.map((record) => record.id),
        [percentLiteralId],
      );

      const underscoreLiteral = await repository.searchAudit({
        limit: 10,
        actorKind: 'api_key',
        action: 'audit.search.literal',
        targetType: 'audit_test',
        search: 'literal_match',
      });
      assert.deepEqual(
        underscoreLiteral.records.map((record) => record.id),
        [underscoreLiteralId],
      );
    } finally {
      await pool.query(
        'DELETE FROM admin_audit_log WHERE actor_key_id = $1',
        [keyId],
      );
      await pool.query(
        'DELETE FROM admin_api_keys WHERE id = $1',
        [keyId],
      );
      await pool.end();
    }
  },
);
