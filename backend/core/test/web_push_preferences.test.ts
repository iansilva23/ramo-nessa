import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePushDeviceRegistration } from '../src/notifications/push-device-validation.js';
import { fcmMessagePayload, type PushDeliveryRequest } from '../src/notifications/push-delivery-provider.js';
import { InMemoryPushDeviceRepository } from '../src/notifications/repositories/in-memory-push-device-repository.js';
import { PushNotificationService, pushDevicePublicView, registerPushDevice } from '../src/notifications/push-notification-service.js';

const session = { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', subjectId: 'web-user', subjectType: 'passenger' as const,
  tokenHash: 'auth-hash', createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-10-01T00:00:00Z' };
const registration = { platform: 'web' as const, provider: 'fcm' as const, token: 'web-fcm-token-aaaaaaaaaaaaaaaaaaaa', notificationPreference: 'important' as const };

test('Web Push aceita FCM e preferência explícita, rejeita combinações inválidas', () => {
  assert.equal(parsePushDeviceRegistration(registration).notificationPreference, 'important');
  for (const invalid of [
    { ...registration, provider: 'apns' }, { ...registration, provider: 'webhook' },
    { ...registration, notificationPreference: 'yes' }, { ...registration, notificationPreference: true },
    { ...registration, platform: 'desktop' },
  ]) assert.throws(() => parsePushDeviceRegistration(invalid));
});

test('importantes bloqueia marketing e broadcasts opcionais, preservando avisos operacionais', async () => {
  const repo = new InMemoryPushDeviceRepository();
  const sent: PushDeliveryRequest[] = [];
  const service = new PushNotificationService(repo, { kind: 'test', send: async input => { sent.push(input); return { delivered: true }; } }, false);
  const device = await registerPushDevice({ repository: repo, session, registration });
  const publicView = pushDevicePublicView(device);
  assert.equal(publicView.notificationPreference, 'important');
  assert.ok(!('token' in publicView)); assert.ok(!('tokenHash' in publicView));
  for (const type of ['marketing.benefit', 'admin.broadcast.promotion', 'admin.broadcast.event', 'admin.broadcast.general']) {
    const result = await service.notifyAudience({ audience: 'all', message: { type, title: 'Title', body: 'Body' } });
    assert.equal(result.delivered, 0);
  }
  for (const type of ['driver.offer.new', 'ride.updated', 'payment.confirmed', 'admin.broadcast.maintenance', 'app.update']) {
    const result = await service.notifySubject({ subjectType: 'passenger', subjectId: session.subjectId, message: { type, title: 'Title', body: 'Body' } });
    assert.equal(result.delivered, 1);
  }
  assert.equal(sent.length, 5);
});

test('mudança de preferência atua no próximo envio e clientes antigos preservam a escolha', async () => {
  const repo = new InMemoryPushDeviceRepository();
  const service = new PushNotificationService(repo, { kind: 'test', send: async () => ({ delivered: true }) }, false);
  await registerPushDevice({ repository: repo, session, registration: { ...registration, notificationPreference: 'all' } });
  const notify = () => service.notifySubject({ subjectType: 'passenger', subjectId: session.subjectId, message: { type: 'marketing.benefit', title: 'Title', body: 'Body' } });
  assert.equal((await notify()).delivered, 1);
  await registerPushDevice({ repository: repo, session, registration });
  assert.equal((await notify()).delivered, 0);
  const { notificationPreference: _preference, ...legacy } = registration;
  await registerPushDevice({ repository: repo, session, registration: legacy });
  assert.equal((await notify()).delivered, 0);
});

test('Web Push troca dono do token, separa sessões e não envia após logout/expiração', async () => {
  const repo = new InMemoryPushDeviceRepository();
  const service = new PushNotificationService(repo, { kind: 'test', send: async () => ({ delivered: true }) }, false);
  await registerPushDevice({ repository: repo, session, registration });
  const next = { ...session, id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', subjectId: 'other-user' };
  await registerPushDevice({ repository: repo, session: next, registration });
  assert.equal((await repo.listEnabledForSubject('passenger', session.subjectId)).length, 0);
  await repo.disableForSession(session.id, new Date().toISOString());
  assert.equal((await repo.listEnabledForSubject('passenger', next.subjectId)).length, 1);
  const message = { type: 'ride.updated', title: 'Title', body: 'Body' };
  assert.equal((await service.notifySubject({ subjectType: 'passenger', subjectId: next.subjectId, message, now: new Date('2100-01-01') })).delivered, 0);
  await repo.disableForSession(next.id, new Date().toISOString());
  assert.equal((await service.notifySubject({ subjectType: 'passenger', subjectId: next.subjectId, message })).delivered, 0);
});

test('FCM Web usa data-only, TTL da oferta e não entrega links/metadados arbitrários', () => {
  const payload = fcmMessagePayload({ ...registration, tokenProvider: 'fcm', message: {
    type: 'driver.offer.new', title: 'Nova corrida', body: 'Abra o app', data: { url: 'https://evil.example', type: 'spoof' },
  } });
  assert.ok('webpush' in payload);
  assert.equal(payload.webpush?.headers.TTL, '35');
  assert.ok(!('notification' in payload));
  assert.deepEqual(payload.data, { type: 'driver.offer.new', title: 'Nova corrida', body: 'Abra o app' });
  const native = fcmMessagePayload({ ...registration, platform: 'ios', tokenProvider: 'fcm', message: { type: 'ride.updated', title: 'Title', body: 'Body' } });
  assert.ok('notification' in native); assert.ok('apns' in native); assert.ok(!('webpush' in native));
});
