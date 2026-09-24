import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeAdminAuditCursor,
  InvalidAdminRequestError,
  parseAdminAuditQuery,
} from '../src/admin/admin-validation.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';

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
