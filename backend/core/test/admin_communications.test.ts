import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAdminCommunicationsRepository } from '../src/admin/repositories/in-memory-admin-communications-repository.js';
import {
  sendAdminNotification,
  updateAgencyPromotion,
  updateAppReleasePolicy,
} from '../src/admin/admin-communications-service.js';
import { InMemoryPushDeviceRepository } from '../src/notifications/repositories/in-memory-push-device-repository.js';
import {
  PushNotificationService,
  registerPushDevice,
} from '../src/notifications/push-notification-service.js';
import type {
  PushDeliveryProvider,
  PushDeliveryRequest,
} from '../src/notifications/push-delivery-provider.js';
import type { AuthSessionRecord } from '../src/auth/auth-session-repository.js';

class CapturingProvider implements PushDeliveryProvider {
  readonly kind = 'test';
  readonly requests: PushDeliveryRequest[] = [];

  async send(input: PushDeliveryRequest) {
    this.requests.push(input);
    return { delivered: true };
  }
}

const actor = {
  kind: 'user' as const,
  id: 'admin-1',
  name: 'Ian',
};

function session(
  id: string,
  subjectId: string,
  subjectType: 'passenger' | 'driver',
): AuthSessionRecord {
  return {
    id,
    subjectId,
    subjectType,
    tokenHash: `hash-${id}`,
    expiresAt: '2026-10-24T00:00:00.000Z',
    createdAt: '2026-09-24T00:00:00.000Z',
  };
}

test('Admin envia aviso segmentado e registra histórico/auditoria', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();
  const devices = new InMemoryPushDeviceRepository();
  const provider = new CapturingProvider();
  const push = new PushNotificationService(
    devices,
    provider,
    false,
  );

  await registerPushDevice({
    repository: devices,
    session: session(
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      'passenger-1',
      'passenger',
    ),
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'passenger-token-aaaaaaaaaaaaaaaaaaa',
      appVersion: '0.1.0',
      buildNumber: 1,
    },
  });
  await registerPushDevice({
    repository: devices,
    session: session(
      'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      'driver-1',
      'driver',
    ),
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'driver-token-bbbbbbbbbbbbbbbbbbbbb',
      appVersion: '0.1.0',
      buildNumber: 1,
    },
  });

  const campaign = await sendAdminNotification({
    communications,
    admin,
    actor,
    push,
    audience: 'passenger',
    category: 'event',
    title: 'Evento em Jeri',
    body: 'Atenção para alteração no trânsito hoje.',
  });

  assert.equal(campaign.deviceCount, 1);
  assert.equal(campaign.deliveredCount, 1);
  assert.equal(provider.requests.length, 1);
  assert.equal(
    provider.requests[0]?.message.type,
    'admin.broadcast.event',
  );
  assert.equal((await communications.listCampaigns(10)).length, 1);
  assert.equal((await admin.listAudit(10)).length, 1);
});

test('nova versão avisa apenas aparelhos abaixo do build mais recente', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();
  const devices = new InMemoryPushDeviceRepository();
  const provider = new CapturingProvider();
  const push = new PushNotificationService(
    devices,
    provider,
    false,
  );

  await registerPushDevice({
    repository: devices,
    session: session(
      'cccccccc-3333-4333-8333-cccccccccccc',
      'passenger-old',
      'passenger',
    ),
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'old-token-cccccccccccccccccccccccc',
      appVersion: '0.1.0',
      buildNumber: 1,
    },
  });
  await registerPushDevice({
    repository: devices,
    session: session(
      'dddddddd-4444-4444-8444-dddddddddddd',
      'passenger-new',
      'passenger',
    ),
    registration: {
      platform: 'android',
      provider: 'fcm',
      token: 'new-token-dddddddddddddddddddddd',
      appVersion: '0.2.0',
      buildNumber: 2,
    },
  });

  const result = await updateAppReleasePolicy({
    communications,
    devices,
    admin,
    actor,
    push,
    appKind: 'passenger',
    platform: 'android',
    latestVersion: '0.2.0',
    latestBuild: 2,
    minimumBuild: 1,
    updateMessage: 'Atualize para a versão mais recente.',
  });

  assert.equal(result.automaticNotification.outdatedDevices, 1);
  assert.equal(result.automaticNotification.delivered, 1);
  assert.equal(provider.requests.length, 1);
  assert.equal(
    provider.requests[0]?.message.type,
    'app.update.available',
  );

  const second = await updateAppReleasePolicy({
    communications,
    devices,
    admin,
    actor,
    push,
    appKind: 'passenger',
    platform: 'android',
    latestVersion: '0.2.0',
    latestBuild: 2,
    minimumBuild: 1,
    updateMessage: 'Atualize para a versão mais recente.',
  });
  assert.equal(second.automaticNotification.outdatedDevices, 0);
});

test('promoção da agência é persistida e auditada', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();

  const promotion = await updateAgencyPromotion({
    communications,
    admin,
    actor,
    enabled: true,
    title: 'Ramo Nessa Agência',
    subtitle: 'Passeios em Jericoacoara',
    description: 'Passeios selecionados com atendimento local.',
    ctaLabel: 'Ver passeios',
    ctaUrl: 'https://example.com/passeios',
  });

  assert.equal(promotion.enabled, true);
  assert.equal(
    (await communications.getAgencyPromotion()).ctaLabel,
    'Ver passeios',
  );
  assert.equal((await admin.listAudit(10)).length, 1);
});
