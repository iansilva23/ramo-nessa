import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthSessionRecord } from '../src/auth/auth-session-repository.js';
import { InMemoryPushDeviceRepository } from '../src/notifications/repositories/in-memory-push-device-repository.js';
import {
  PushNotificationService,
  registerPushDevice,
} from '../src/notifications/push-notification-service.js';
import type {
  PushDeliveryProvider,
  PushDeliveryRequest,
  PushDeliveryResult,
} from '../src/notifications/push-delivery-provider.js';

const session: AuthSessionRecord = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  subjectId: 'driver-push',
  subjectType: 'driver',
  tokenHash: 'session-hash',
  expiresAt: '2026-10-24T00:00:00.000Z',
  createdAt: '2026-09-24T00:00:00.000Z',
};

class CapturingProvider implements PushDeliveryProvider {
  readonly kind = 'test';
  readonly requests: PushDeliveryRequest[] = [];

  constructor(private readonly invalidToken: string | null = null) {}

  async send(
    input: PushDeliveryRequest,
  ): Promise<PushDeliveryResult> {
    this.requests.push(input);
    return {
      delivered: input.token !== this.invalidToken,
      ...(input.token === this.invalidToken
        ? { invalidToken: true }
        : {}),
    };
  }
}

test('registro push troca token antigo somente da mesma sessão', async () => {
  const repository = new InMemoryPushDeviceRepository();

  await registerPushDevice({
    repository,
    session,
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'token-driver-aaaaaaaaaaaaaaaaaaaa',
    },
    now: new Date('2026-09-24T01:00:00.000Z'),
  });
  const latest = await registerPushDevice({
    repository,
    session,
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'token-driver-bbbbbbbbbbbbbbbbbbbb',
    },
    now: new Date('2026-09-24T01:01:00.000Z'),
  });

  const enabled = await repository.listEnabledForSubject(
    'driver',
    'driver-push',
  );
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0]?.id, latest.id);
});

test('logout desativa somente dispositivos da sessão informada', async () => {
  const repository = new InMemoryPushDeviceRepository();
  const otherSession: AuthSessionRecord = {
    ...session,
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  };

  await registerPushDevice({
    repository,
    session,
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'token-session-one-aaaaaaaaaaaaaaaa',
    },
  });
  await registerPushDevice({
    repository,
    session: otherSession,
    registration: {
      platform: 'ios',
      provider: 'fcm',
      token: 'token-session-two-bbbbbbbbbbbbbbbb',
    },
  });

  assert.equal(
    await repository.disableForSession(
      session.id,
      '2026-09-24T02:00:00.000Z',
    ),
    1,
  );

  const enabled = await repository.listEnabledForSubject(
    'driver',
    'driver-push',
  );
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0]?.sessionId, otherSession.id);
});

test('serviço entrega em devices ativos e invalida token rejeitado', async () => {
  const repository = new InMemoryPushDeviceRepository();
  const invalidToken = 'invalid-token-cccccccccccccccccccc';
  const provider = new CapturingProvider(invalidToken);

  await registerPushDevice({
    repository,
    session,
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: invalidToken,
    },
  });
  await registerPushDevice({
    repository,
    session: {
      ...session,
      id: 'cccccccc-3333-4333-8333-cccccccccccc',
    },
    registration: {
      platform: 'ios',
      provider: 'fcm',
      token: 'valid-token-dddddddddddddddddddd',
    },
  });

  const service = new PushNotificationService(repository, provider);
  const stats = await service.notifySubject({
    subjectType: 'driver',
    subjectId: 'driver-push',
    message: {
      type: 'driver.offer.new',
      title: 'Nova corrida',
      body: 'Abra o app para responder.',
      data: { rideId: 'ride-1' },
    },
  });

  assert.deepEqual(stats, {
    devices: 2,
    delivered: 1,
    invalidated: 1,
  });
  assert.equal(provider.requests.length, 2);
  assert.equal(
    (await repository.listEnabledForSubject('driver', 'driver-push'))
      .length,
    1,
  );
});
