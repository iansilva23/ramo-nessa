import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import {
  authenticateBearer,
  AuthenticationError,
  hashBearerToken,
  issueAuthSession,
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
    status: 'suspended',
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
