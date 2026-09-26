import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminDriverAuthError,
  provisionDriverAuthFromAdmin,
  setDriverAuthStatusFromAdmin,
} from '../src/admin/admin-driver-auth-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { issueAuthSession, hashBearerToken } from '../src/auth/auth-service.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-driver-approval-test',
  name: 'Admin Driver Approval Test',
};

const driverId = 'driver-access-approval';

function approvedProfile(now: string) {
  return {
    driverId,
    fullName: 'Motorista Teste',
    status: 'approved' as const,
    createdAt: now,
    updatedAt: now,
  };
}

function approvedVehicle(now: string) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    driverId,
    plateNormalized: 'ABC1D23',
    make: 'Toyota',
    model: 'Hilux',
    modelYear: 2020,
    color: 'Prata',
    categories: ['comfort_black'] as const,
    fourByFour: true,
    seatCapacity: 5,
    status: 'approved' as const,
    createdAt: now,
    updatedAt: now,
  };
}

test('Admin não libera OTP antes de perfil e veículo aprovados', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const admin = new InMemoryAdminRepository();

  const provisioned = await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    registry,
    admin,
    actor,
    driverId,
    phone: '(88) 99999-1234',
    status: 'suspended',
    now: new Date('2026-09-26T20:10:00.000Z'),
  });

  assert.equal(provisioned.identity.status, 'suspended');

  await assert.rejects(
    setDriverAuthStatusFromAdmin({
      identities,
      sessions,
      registry,
      admin,
      actor,
      driverId,
      status: 'active',
      now: new Date('2026-09-26T20:11:00.000Z'),
    }),
    (error: unknown) =>
      error instanceof AdminDriverAuthError &&
      error.code === 'DRIVER_REGISTRY_NOT_APPROVED',
  );

  const now = '2026-09-26T20:12:00.000Z';
  await registry.upsertProfile(approvedProfile(now));
  await registry.upsertVehicle(approvedVehicle(now));

  const activated = await setDriverAuthStatusFromAdmin({
    identities,
    sessions,
    registry,
    admin,
    actor,
    driverId,
    status: 'active',
    now: new Date('2026-09-26T20:13:00.000Z'),
  });

  assert.equal(activated.identity.status, 'active');
});

test('suspender acesso revoga sessões já emitidas', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const admin = new InMemoryAdminRepository();
  const now = '2026-09-26T20:14:00.000Z';

  await registry.upsertProfile(approvedProfile(now));
  await registry.upsertVehicle(approvedVehicle(now));

  await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    registry,
    admin,
    actor,
    driverId,
    phone: '(88) 99999-1234',
    status: 'active',
    now: new Date(now),
  });

  const issued = await issueAuthSession({
    repository: sessions,
    subjectId: driverId,
    subjectType: 'driver',
    now: new Date('2026-09-26T20:15:00.000Z'),
  });

  const suspended = await setDriverAuthStatusFromAdmin({
    identities,
    sessions,
    registry,
    admin,
    actor,
    driverId,
    status: 'suspended',
    now: new Date('2026-09-26T20:16:00.000Z'),
  });

  assert.equal(suspended.identity.status, 'suspended');
  assert.equal(suspended.revokedSessions, 1);

  const stored = await sessions.findByTokenHash(
    hashBearerToken(issued.token),
  );
  assert.ok(stored);
  assert.equal(stored.revokedAt, '2026-09-26T20:16:00.000Z');
});
