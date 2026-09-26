import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAdminCommunicationsRepository } from '../src/admin/repositories/in-memory-admin-communications-repository.js';
import {
  agencyTourPublicView,
  listPublicAgencyTours,
  sendAdminNotification,
  updateAgencyPromotion,
  updateAgencyTour,
  updateAgencyTourCover,
  updateAppReleasePolicy,
  updateSocialLinks,
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
import {
  parseAdminAgencyTourUpdate,
  parseAdminSocialLinksUpdate,
} from '../src/admin/admin-communications-validation.js';

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
      provider: 'webhook',
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
      provider: 'webhook',
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
      provider: 'webhook',
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
      provider: 'webhook',
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


test('Instagram oficial é normalizado, persistido e auditado', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();

  const parsed = parseAdminSocialLinksUpdate({
    instagramHandle: ' @Ramo.Nessa_Oficial ',
  });
  assert.deepEqual(parsed, {
    instagramHandle: '@Ramo.Nessa_Oficial',
    instagramUrl: 'https://www.instagram.com/Ramo.Nessa_Oficial/',
  });

  const saved = await updateSocialLinks({
    communications,
    admin,
    actor,
    ...parsed,
    now: new Date('2026-09-26T14:00:00.000Z'),
  });

  assert.equal(saved.instagramHandle, '@Ramo.Nessa_Oficial');
  assert.equal(
    saved.instagramUrl,
    'https://www.instagram.com/Ramo.Nessa_Oficial/',
  );
  assert.equal(
    (await communications.getSocialLinks()).instagramHandle,
    '@Ramo.Nessa_Oficial',
  );
  assert.equal((await admin.listAudit(10)).length, 1);

  assert.throws(
    () => parseAdminSocialLinksUpdate({
      instagramHandle: 'instagram.com/nao-pode',
    }),
    /Instagram/,
  );
});


test('catálogo de passeios mantém rascunhos fora do app e normaliza reserva', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();

  const parsed = parseAdminAgencyTourUpdate({
    enabled: true,
    sortOrder: 5,
    title: 'Lado Leste Premium',
    badge: 'compartilhado',
    shortDescription: 'Lagoas e praias do litoral leste.',
    description:
      'Passeio com roteiro administrado diretamente pelo painel.',
    highlights: ['Árvore da Preguiça', 'Praia do Preá'],
    included: ['Transporte'],
    excluded: ['Alimentação'],
    duration: '6 horas',
    schedule: 'Saída pela manhã',
    departure: 'Jericoacoara',
    priceLabel: 'A partir de',
    priceCents: 7500,
    priceSuffix: 'por pessoa',
    whatsappPhone: '(88) 99999-9999',
    whatsappMessage: 'Olá! Quero reservar o Lado Leste.',
  });

  assert.equal(parsed.badge, 'COMPARTILHADO');
  assert.equal(parsed.whatsappPhone, '+88999999999');

  const saved = await updateAgencyTour({
    communications,
    admin,
    actor,
    slug: 'lado-leste',
    ...parsed,
    now: new Date('2026-09-26T16:00:00.000Z'),
  });

  assert.equal(saved.enabled, true);
  assert.equal(saved.priceCents, 7500);
  assert.equal(saved.highlights.length, 2);
  assert.equal(saved.coverImageUrl, null);

  const publicTours = await listPublicAgencyTours({ communications });
  assert.equal(publicTours.length, 1);
  assert.equal(publicTours[0]?.slug, 'lado-leste');

  const drafts = (await communications.listTours(true)).filter(
    (tour) => !tour.enabled,
  );
  assert.ok(drafts.some((tour) => tour.slug === 'lado-oeste'));
  assert.equal((await admin.listAudit(10)).length, 1);
});

test('foto do passeio é versionada e publicada sem expor rascunhos', async () => {
  const communications =
    new InMemoryAdminCommunicationsRepository();
  const admin = new InMemoryAdminRepository();

  const draft = await communications.getTour('lado-oeste');
  assert.ok(draft);
  assert.equal(draft.enabled, false);

  const cover = await updateAgencyTourCover({
    communications,
    admin,
    actor,
    slug: 'lado-oeste',
    mimeType: 'image/webp',
    bytes: Uint8Array.from([82, 78, 1, 2, 3, 4]),
    now: new Date('2026-09-26T16:10:00.000Z'),
  });
  assert.ok(cover);
  assert.equal(cover.coverImageVersion, 1);
  assert.match(
    cover.coverImageUrl ?? '',
    /\/v1\/content\/tours\/lado-oeste\/cover\?v=1$/,
  );

  const storedCover =
    await communications.readTourCover('lado-oeste');
  assert.ok(storedCover);
  assert.equal(storedCover.mimeType, 'image/webp');
  assert.deepEqual(
    [...storedCover.bytes],
    [82, 78, 1, 2, 3, 4],
  );

  const publicTours = await listPublicAgencyTours({ communications });
  assert.ok(!publicTours.some((tour) => tour.slug === 'lado-oeste'));

  const view = agencyTourPublicView(
    (await communications.getTour('lado-oeste'))!,
  );
  assert.equal(view.coverImageVersion, 1);
  assert.equal((await admin.listAudit(10)).length, 1);
});

test('passeio publicado exige WhatsApp de reserva', () => {
  assert.throws(
    () =>
      parseAdminAgencyTourUpdate({
        enabled: true,
        sortOrder: 10,
        title: 'Passeio sem contato',
        badge: 'PRIVATIVO',
        shortDescription: 'Descrição curta válida.',
        description: 'Descrição completa válida.',
        highlights: [],
        included: [],
        excluded: [],
        priceLabel: 'Consulte',
        whatsappPhone: '',
        whatsappMessage: '',
      }),
    /WhatsApp/,
  );
});
