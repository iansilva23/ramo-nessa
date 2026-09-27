import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPassengerError,
  adminPassengerProfile,
  updatePassengerProfileFromAdmin,
} from '../src/admin/admin-passenger-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(input: {
  id: string;
  passengerId: string;
  state: RideRecord['state'];
  amountCents: number;
  updatedAt: string;
}): RideRecord {
  return {
    id: input.id,
    passengerId: input.passengerId,
    state: input.state,
    paymentStatus:
      input.state === 'COMPLETED' ? 'paid' : 'pending',
    origin: { zoneId: 'prea', localityId: 'prea' },
    destination: { zoneId: 'jijoca', localityId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 2,
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.89860,
    dropoffLongitude: -40.45060,
    quote: {
      ruleId: 'passenger-profile-test',
      baseAmountCents: input.amountCents,
      pickupCompensationCents: 0,
      totalAmountCents: input.amountCents,
      platformCommissionCents: Math.round(input.amountCents * 0.1),
      driverNetCents: Math.round(input.amountCents * 0.9),
    },
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  };
}

test('ficha Admin do passageiro agrega identidade e histórico exato sem GPS', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const rides = new InMemoryRideRepository();

  await identities.createIdentity({
    id: '11111111-1111-4111-8111-111111111111',
    subjectId: 'passenger-profile-001',
    subjectType: 'passenger',
    phoneE164: '+5588999991001',
    status: 'active',
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
  });

  await rides.create(
    ride({
      id: '22222222-2222-4222-8222-222222222222',
      passengerId: 'passenger-profile-001',
      state: 'COMPLETED',
      amountCents: 12000,
      updatedAt: '2026-09-22T12:00:00.000Z',
    }),
  );
  await rides.create(
    ride({
      id: '33333333-3333-4333-8333-333333333333',
      passengerId: 'passenger-profile-001',
      state: 'IN_PROGRESS',
      amountCents: 8000,
      updatedAt: '2026-09-23T12:00:00.000Z',
    }),
  );
  await rides.create(
    ride({
      id: '44444444-4444-4444-8444-444444444444',
      passengerId: 'passenger-profile-001-extra',
      state: 'COMPLETED',
      amountCents: 50000,
      updatedAt: '2026-09-24T12:00:00.000Z',
    }),
  );

  const profile = await adminPassengerProfile({
    identities,
    rides,
    passengerId: 'passenger-profile-001',
  });

  assert.deepEqual(profile.passenger, {
    passengerId: 'passenger-profile-001',
    phoneE164: '+5588999991001',
    fullName: null,
    email: null,
    status: 'active',
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
  });
  assert.deepEqual(profile.rides, {
    total: 2,
    active: 1,
    completed: 1,
    cancelled: 0,
    completedAmountCents: 12000,
  });
  assert.equal(profile.recentRides.length, 2);
  assert.equal(
    profile.recentRides[0]?.id,
    '33333333-3333-4333-8333-333333333333',
  );
  assert.equal(
    profile.recentRides.some(
      (item) => 'pickupLatitude' in item || 'dropoffLatitude' in item,
    ),
    false,
  );
});

test('ficha Admin retorna erro explícito para passageiro inexistente', async () => {
  await assert.rejects(
    () =>
      adminPassengerProfile({
        identities: new InMemoryAuthOtpRepository(),
        rides: new InMemoryRideRepository(),
        passengerId: 'passenger-missing',
      }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'PASSENGER_NOT_FOUND',
  );
});


test('Admin edita nome e e-mail do passageiro com validação e auditoria', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-passenger-profile-edit',
    name: 'Admin Passenger Profile Edit',
  };

  await identities.createIdentity({
    id: '55555555-5555-4555-8555-555555555551',
    subjectId: 'passenger-edit-001',
    subjectType: 'passenger',
    phoneE164: '+5588999992001',
    fullName: 'Nome Antigo',
    emailNormalized: 'antigo@example.com',
    status: 'active',
    createdAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T18:00:00.000Z',
  });
  await identities.createIdentity({
    id: '55555555-5555-4555-8555-555555555552',
    subjectId: 'passenger-edit-002',
    subjectType: 'passenger',
    phoneE164: '+5588999992002',
    fullName: 'Outro Passageiro',
    emailNormalized: 'ocupado@example.com',
    status: 'active',
    createdAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T18:00:00.000Z',
  });

  const updated = await updatePassengerProfileFromAdmin({
    identities,
    admin,
    actor,
    passengerId: 'passenger-edit-001',
    fullName: '  Maria da Silva  ',
    email: '  MARIA@Example.COM ',
    now: new Date('2026-09-26T19:55:00.000Z'),
  });

  assert.equal(updated.fullName, 'Maria da Silva');
  assert.equal(updated.email, 'maria@example.com');
  assert.equal(updated.phoneE164, '+5588999992001');

  const stored = await identities.findIdentityBySubject(
    'passenger',
    'passenger-edit-001',
  );
  assert.equal(stored?.fullName, 'Maria da Silva');
  assert.equal(stored?.emailNormalized, 'maria@example.com');

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'passenger.profile.updated');
  assert.equal(audit[0]?.targetId, 'passenger-edit-001');
  assert.deepEqual(audit[0]?.metadata, {
    fullNameChanged: true,
    emailChanged: true,
  });

  const same = await updatePassengerProfileFromAdmin({
    identities,
    admin,
    actor,
    passengerId: 'passenger-edit-001',
    fullName: 'Maria da Silva',
    email: 'maria@example.com',
  });
  assert.equal(same.fullName, 'Maria da Silva');
  assert.equal((await admin.listAudit(10)).length, 1);

  const cleared = await updatePassengerProfileFromAdmin({
    identities,
    admin,
    actor,
    passengerId: 'passenger-edit-001',
    fullName: null,
    email: null,
    now: new Date('2026-09-26T20:00:00.000Z'),
  });
  assert.equal(cleared.fullName, null);
  assert.equal(cleared.email, null);

  const clearedStored = await identities.findIdentityBySubject(
    'passenger',
    'passenger-edit-001',
  );
  assert.equal(clearedStored?.fullName, undefined);
  assert.equal(clearedStored?.emailNormalized, undefined);

  const auditAfterClear = await admin.listAudit(10);
  assert.equal(auditAfterClear.length, 2);
  assert.deepEqual(auditAfterClear[0]?.metadata, {
    fullNameChanged: true,
    emailChanged: true,
  });

  await assert.rejects(
    () =>
      updatePassengerProfileFromAdmin({
        identities,
        admin,
        actor,
        passengerId: 'passenger-edit-001',
        email: 'ocupado@example.com',
      }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'PASSENGER_EMAIL_IN_USE',
  );

  await assert.rejects(
    () =>
      updatePassengerProfileFromAdmin({
        identities,
        admin,
        actor,
        passengerId: 'passenger-edit-001',
        fullName: 'X',
      }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'INVALID_PASSENGER_NAME',
  );

  await assert.rejects(
    () =>
      updatePassengerProfileFromAdmin({
        identities,
        admin,
        actor,
        passengerId: 'passenger-edit-001',
        email: 'email-invalido',
      }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'INVALID_PASSENGER_EMAIL',
  );
});
