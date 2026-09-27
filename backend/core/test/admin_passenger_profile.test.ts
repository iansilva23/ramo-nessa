import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPassengerError,
  adminPassengerNotificationsView,
  adminPassengerProfile,
  adminPassengerWalletView,
  updatePassengerProfileFromAdmin,
} from '../src/admin/admin-passenger-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryPushDeviceRepository } from '../src/notifications/repositories/in-memory-push-device-repository.js';
import { InMemoryPassengerSavedPlaceRepository } from '../src/passengers/repositories/in-memory-passenger-saved-place-repository.js';
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
  const savedPlaces = new InMemoryPassengerSavedPlaceRepository();

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
  await savedPlaces.save({
    id: 'saved-place-home-001',
    passengerId: 'passenger-profile-001',
    kind: 'home',
    label: 'Casa',
    name: 'Casa da Maria',
    address: 'Rua Principal, 100',
    latitude: -2.82017,
    longitude: -40.41467,
    createdAt: '2026-09-21T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
  });
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
    savedPlaces,
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
  assert.deepEqual(profile.savedPlaces, [
    {
      id: 'saved-place-home-001',
      kind: 'home',
      label: 'Casa',
      name: 'Casa da Maria',
      address: 'Rua Principal, 100',
      createdAt: '2026-09-21T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    },
  ]);
  assert.equal(
    'latitude' in profile.savedPlaces[0]! ||
      'longitude' in profile.savedPlaces[0]!,
    false,
  );
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
        savedPlaces: new InMemoryPassengerSavedPlaceRepository(),
        passengerId: 'passenger-missing',
      }),
    (error: unknown) =>
      error instanceof AdminPassengerError &&
      error.code === 'PASSENGER_NOT_FOUND',
  );
});

test('Admin consulta carteira e notificações do passageiro sem expor credenciais', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const devices = new InMemoryPushDeviceRepository();
  await identities.createIdentity({
    id: '55555555-5555-4555-8555-555555555550',
    subjectId: 'passenger-operations-001',
    subjectType: 'passenger',
    phoneE164: '+5588999991999',
    status: 'active',
    createdAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T18:00:00.000Z',
  });
  await devices.registerForSession({
    id: 'push-device-passenger-001',
    sessionId: 'private-session-id',
    subjectId: 'passenger-operations-001',
    subjectType: 'passenger',
    platform: 'android',
    provider: 'fcm',
    token: 'private-fcm-token',
    tokenHash: 'private-fcm-token-hash',
    appVersion: '1.2.3',
    buildNumber: 123,
    createdAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T19:00:00.000Z',
  });

  const requestedAccounts: string[] = [];
  const wallet = await adminPassengerWalletView({
    identities,
    finance: {
      async getAccountBalanceCents(accountKey) {
        requestedAccounts.push(accountKey);
        return 4250;
      },
    },
    passengerId: 'passenger-operations-001',
  });
  const notifications = await adminPassengerNotificationsView({
    identities,
    devices,
    passengerId: 'passenger-operations-001',
  });

  assert.deepEqual(requestedAccounts, [
    'passenger:passenger-operations-001:wallet',
  ]);
  assert.deepEqual(wallet, { balanceCents: 4250 });
  assert.deepEqual(notifications, {
    enabledDevices: 1,
    devices: [
      {
        platform: 'android',
        provider: 'fcm',
        appVersion: '1.2.3',
        buildNumber: 123,
        lastSeenAt: '2026-09-26T19:00:00.000Z',
        updatedAt: '2026-09-26T19:00:00.000Z',
      },
    ],
  });
  const serialized = JSON.stringify(notifications);
  assert.equal(serialized.includes('private-fcm-token'), false);
  assert.equal(serialized.includes('private-session-id'), false);
  assert.equal(serialized.includes('tokenHash'), false);
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
