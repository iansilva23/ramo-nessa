import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPassengerError,
  setPassengerAuthStatusFromAdmin,
} from '../src/admin/admin-passenger-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';

test('bloqueio de passageiro revoga sessão e desbloqueio preserva histórico', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const admin = new InMemoryAdminRepository();

  await identities.createIdentity({
    id: '11111111-1111-4111-8111-111111111111',
    subjectId: 'passenger-block-test',
    subjectType: 'passenger',
    phoneE164: '+5588999990001',
    status: 'active',
    createdAt: '2026-09-24T01:00:00.000Z',
    updatedAt: '2026-09-24T01:00:00.000Z',
  });
  await sessions.create({
    id: '22222222-2222-4222-8222-222222222222',
    subjectId: 'passenger-block-test',
    subjectType: 'passenger',
    tokenHash: 'passenger-block-session-hash',
    expiresAt: '2026-09-25T01:00:00.000Z',
    createdAt: '2026-09-24T01:00:00.000Z',
  });

  const actor = {
    kind: 'user' as const,
    id: 'admin-block-test',
    name: 'Admin Block Test',
  };

  const blocked = await setPassengerAuthStatusFromAdmin({
    identities,
    sessions,
    admin,
    actor,
    passengerId: 'passenger-block-test',
    status: 'suspended',
    now: new Date('2026-09-24T01:05:00.000Z'),
  });

  assert.equal(blocked.identity.status, 'suspended');
  assert.equal(blocked.revokedSessions, 1);

  const oldSession = await sessions.findByTokenHash(
    'passenger-block-session-hash',
  );
  assert.equal(
    oldSession?.revokedAt,
    '2026-09-24T01:05:00.000Z',
  );

  const unblocked = await setPassengerAuthStatusFromAdmin({
    identities,
    sessions,
    admin,
    actor,
    passengerId: 'passenger-block-test',
    status: 'active',
    now: new Date('2026-09-24T01:10:00.000Z'),
  });

  assert.equal(unblocked.identity.status, 'active');
  assert.equal(unblocked.revokedSessions, 0);
  assert.equal(
    (await sessions.findByTokenHash('passenger-block-session-hash'))
      ?.revokedAt,
    '2026-09-24T01:05:00.000Z',
  );

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 2);
  assert.equal(audit[0]?.action, 'passenger.auth.status_changed');
  assert.equal(audit[0]?.metadata.previousStatus, 'suspended');
  assert.equal(audit[0]?.metadata.status, 'active');
  assert.equal(audit[1]?.metadata.revokedSessions, 1);
});

test('status inválido de passageiro é rejeitado', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const admin = new InMemoryAdminRepository();

  await assert.rejects(
    setPassengerAuthStatusFromAdmin({
      identities,
      sessions,
      admin,
      actor: {
        kind: 'user',
        id: 'admin-block-test',
        name: 'Admin Block Test',
      },
      passengerId: 'passenger-block-test',
      status: 'blocked' as never,
    }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'INVALID_PASSENGER_STATUS',
  );
});
