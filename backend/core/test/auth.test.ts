import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import {
  authenticateBearer,
  AuthenticationError,
  hashBearerToken,
  issueAuthSession,
  revokeBearerSession,
} from '../src/auth/auth-service.js';

test('sessão Bearer guarda apenas hash e autentica o papel correto', async () => {
  const repository = new InMemoryAuthSessionRepository();
  const now = new Date('2026-09-23T09:30:00.000Z');

  const issued = await issueAuthSession({
    repository,
    subjectId: 'passenger-auth-001',
    subjectType: 'passenger',
    now,
    ttlMs: 60_000,
  });

  assert.ok(issued.token.length >= 32);
  assert.notEqual(issued.session.tokenHash, issued.token);
  assert.equal(
    issued.session.tokenHash,
    hashBearerToken(issued.token),
  );

  const authenticated = await authenticateBearer({
    repository,
    headers: { authorization: `Bearer ${issued.token}` },
    requiredType: 'passenger',
    now: new Date('2026-09-23T09:30:30.000Z'),
  });

  assert.equal(authenticated.subjectId, 'passenger-auth-001');
  assert.equal(authenticated.subjectType, 'passenger');
});

test('sessão de passenger não autentica rota de driver', async () => {
  const repository = new InMemoryAuthSessionRepository();
  const now = new Date('2026-09-23T09:30:00.000Z');
  const issued = await issueAuthSession({
    repository,
    subjectId: 'passenger-auth-002',
    subjectType: 'passenger',
    now,
    ttlMs: 60_000,
  });

  await assert.rejects(
    () =>
      authenticateBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredType: 'driver',
        now: new Date('2026-09-23T09:30:30.000Z'),
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_ROLE_MISMATCH',
  );
});

test('sessão expirada ou revogada é recusada', async () => {
  const repository = new InMemoryAuthSessionRepository();
  const now = new Date('2026-09-23T09:30:00.000Z');

  const expired = await issueAuthSession({
    repository,
    subjectId: 'driver-auth-expired',
    subjectType: 'driver',
    now,
    ttlMs: 60_000,
  });
  await assert.rejects(
    () =>
      authenticateBearer({
        repository,
        headers: { authorization: `Bearer ${expired.token}` },
        requiredType: 'driver',
        now: new Date('2026-09-23T09:31:01.000Z'),
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_EXPIRED',
  );

  const revoked = await issueAuthSession({
    repository,
    subjectId: 'driver-auth-revoked',
    subjectType: 'driver',
    now,
    ttlMs: 120_000,
  });
  await repository.revoke(
    revoked.session.id,
    '2026-09-23T09:30:20.000Z',
  );

  await assert.rejects(
    () =>
      authenticateBearer({
        repository,
        headers: { authorization: `Bearer ${revoked.token}` },
        requiredType: 'driver',
        now: new Date('2026-09-23T09:30:30.000Z'),
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_INVALID',
  );
});

test('header ausente não autentica', async () => {
  const repository = new InMemoryAuthSessionRepository();

  await assert.rejects(
    () =>
      authenticateBearer({
        repository,
        headers: {},
        requiredType: 'passenger',
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_REQUIRED',
  );
});


test('sessão ainda válida é recusada quando a identidade está suspensa', async () => {
  const sessions = new InMemoryAuthSessionRepository();
  const identities = new InMemoryAuthOtpRepository();
  const now = new Date('2026-09-23T11:20:00.000Z');

  await identities.createIdentity({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    subjectId: 'driver-suspended-session',
    subjectType: 'driver',
    phoneE164: '+5588999991240',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const issued = await issueAuthSession({
    repository: sessions,
    subjectId: 'driver-suspended-session',
    subjectType: 'driver',
    now,
    ttlMs: 120_000,
  });

  const beforeSuspension = await authenticateBearer({
    repository: sessions,
    identities,
    headers: { authorization: `Bearer ${issued.token}` },
    requiredType: 'driver',
    now: new Date('2026-09-23T11:20:10.000Z'),
  });
  assert.equal(beforeSuspension.subjectId, 'driver-suspended-session');

  const suspended = await identities.setIdentityStatus({
    subjectType: 'driver',
    subjectId: 'driver-suspended-session',
    status: 'suspended',
    updatedAt: '2026-09-23T11:20:20.000Z',
  });
  assert.equal(suspended?.status, 'suspended');

  await assert.rejects(
    () =>
      authenticateBearer({
        repository: sessions,
        identities,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredType: 'driver',
        now: new Date('2026-09-23T11:20:30.000Z'),
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_IDENTITY_DISABLED',
  );
});


test('logout revoga token mesmo depois de a identidade ser suspensa', async () => {
  const sessions = new InMemoryAuthSessionRepository();
  const identities = new InMemoryAuthOtpRepository();
  const now = new Date('2026-09-23T12:00:00.000Z');

  await identities.createIdentity({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    subjectId: 'driver-logout-suspended',
    subjectType: 'driver',
    phoneE164: '+5588999991241',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const issued = await issueAuthSession({
    repository: sessions,
    subjectId: 'driver-logout-suspended',
    subjectType: 'driver',
    now,
    ttlMs: 120_000,
  });

  await identities.setIdentityStatus({
    subjectType: 'driver',
    subjectId: 'driver-logout-suspended',
    status: 'suspended',
    updatedAt: '2026-09-23T12:00:10.000Z',
  });

  const revoked = await revokeBearerSession({
    repository: sessions,
    headers: { authorization: `Bearer ${issued.token}` },
    now: new Date('2026-09-23T12:00:20.000Z'),
  });
  assert.equal(revoked.id, issued.session.id);

  const stored = await sessions.findByTokenHash(hashBearerToken(issued.token));
  assert.equal(stored?.revokedAt, '2026-09-23T12:00:20.000Z');

  await assert.rejects(
    () =>
      authenticateBearer({
        repository: sessions,
        identities,
        headers: { authorization: `Bearer ${issued.token}` },
        now: new Date('2026-09-23T12:00:30.000Z'),
      }),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.code === 'AUTH_INVALID',
  );
});
