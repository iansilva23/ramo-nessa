import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryGrowthRepository } from '../src/growth/growth-repository.js';
import {
  DEFAULT_SETTINGS,
  defaultPreference,
  campaignInput,
  monthDay,
  isQuiet,
  localClock,
  type MarketingCampaign,
  type MarketingDelivery,
} from '../src/growth/growth-model.js';
import {
  GrowthService,
  campaignOccurrence,
  baseEligibility,
  type Customer,
  type GrowthDependencies,
} from '../src/growth/growth-service.js';
import { createGrowthChannels } from '../src/growth/growth-channels.js';
import type { PushNotificationService } from '../src/notifications/push-notification-service.js';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryPrivacyRepository } from '../src/privacy/repositories/in-memory-privacy-repository.js';
import {
  createPromotionCampaignRecord,
  applyPromotionToRide,
  PromotionError,
} from '../src/promotions/promotion-service.js';
import type { RideRecord } from '../src/rides/ride.js';
const now = new Date('2026-10-06T15:00:00Z'),
  actor = { kind: 'user' as const, id: 'admin', name: 'Admin' };
function campaign(): MarketingCampaign {
  return campaignInput(
    {
      name: 'Piloto Preá',
      trigger: 'birthday',
      days: 7,
      threshold: 10,
      calendarDay: null,
      title: 'Parabéns!',
      message: 'Confira seu presente pessoal.',
      channels: ['inapp', 'email', 'whatsapp'],
      zones: ['prea'],
      categories: ['moto'],
      audience: 'all',
      enabled: true,
      automatic: true,
      requireSupply: false,
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      couponValueCents: 500,
      couponValidDays: 7,
      budgetCents: 1000,
      maxRecipients: 100,
      channelCostCents: { inapp: 0, push: 0, email: 10, whatsapp: 10 },
      controlPercent: 0,
    },
    undefined,
    now,
  );
}
function delivery(
  c: MarketingCampaign,
  pid = 'p',
  occurrence = '2026',
  channels: MarketingDelivery['channels'] = ['inapp'],
): MarketingDelivery {
  return {
    id: randomUUID(),
    campaignId: c.id,
    campaignVersion: c.updatedAt,
    passengerId: pid,
    occurrence,
    createdAt: now.toISOString(),
    state: 'pending',
    heldCents: 500,
    control: false,
    title: c.title,
    message: c.message,
    couponId: null,
    channels,
    results: {},
    openedAt: null,
  };
}
function customer(): Customer {
  return {
    identity: {
      id: 'i',
      subjectId: 'p',
      subjectType: 'passenger',
      phoneE164: '+5588999999999',
      emailNormalized: 'client@example.test',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: now.toISOString(),
    },
    preference: {
      ...defaultPreference('p'),
      birthdayMonthDay: '10-06',
      zone: 'prea',
      channels: { inapp: true, push: true, email: true, whatsapp: true },
    },
    rides: [],
    completed: 0,
    active: 0,
    tickets: [],
  };
}
async function setup() {
  const admin = new InMemoryAdminRepository(),
    store = new InMemoryGrowthRepository(admin),
    c = { ...campaign(), enabled: true };
  await store.saveCampaign(c, null, actor);
  await store.saveSettings(
    { ...DEFAULT_SETTINGS, enabled: true, updatedAt: now.toISOString() },
    DEFAULT_SETTINGS.updatedAt,
    actor,
  );
  await store.savePreference(customer().preference);
  return { admin, store, c };
}
test('campanhas e canais começam desligados; aniversário e horário usam Fortaleza', () => {
  assert.equal(campaign().enabled, false);
  assert.equal(DEFAULT_SETTINGS.enabled, false);
  assert.ok(Object.values(defaultPreference('p').channels).every((v) => !v));
  for (const bad of ['02-30', '13-01', '00-00', '99-99'])
    assert.throws(() => monthDay(bad));
  assert.equal(monthDay('02-29'), '02-29');
  assert.equal(localClock(new Date('2026-10-07T02:00:00Z')).day, '2026-10-06');
  assert.equal(
    isQuiet(new Date('2026-10-07T02:00:00Z'), DEFAULT_SETTINGS),
    true,
  );
  const u = customer();
  u.preference.birthdayMonthDay = '02-29';
  assert.equal(
    campaignOccurrence(campaign(), u, new Date('2027-02-28T15:00:00Z')),
    '2027',
  );
  assert.equal(
    campaignOccurrence(campaign(), u, new Date('2028-02-28T15:00:00Z')),
    null,
  );
  u.active = 1;
  assert.equal(
    baseEligibility({ ...campaign(), enabled: true }, u, now),
    'Corrida em andamento',
  );
});
test('reservas concorrentes respeitam orçamento, idempotência, versão e consentimento', async () => {
  const { store, c } = await setup();
  const d = delivery(c);
  assert.deepEqual(
    await Promise.all([
      store.reserve(d, c.updatedAt),
      store.reserve(d, c.updatedAt),
    ]),
    [true, false],
  );
  assert.equal(
    await store.reserve(delivery(c, 'p', 'outro'), c.updatedAt),
    true,
  );
  assert.equal(
    await store.reserve(delivery(c, 'p', 'terceiro'), c.updatedAt),
    false,
  );
  await assert.rejects(
    store.saveCampaign(
      { ...c, budgetCents: 999, updatedAt: '2026-10-06T15:00:01Z' },
      c.updatedAt,
      actor,
    ),
  );
  assert.equal(await store.reserve(delivery(c, 'missing'), c.updatedAt), false);
  assert.equal(await store.reserve(delivery(c, 'p', 'wrong'), 'stale'), false);
});
test('limite soma canais entre campanhas e anonimização preserva orçamento', async () => {
  const { store, c } = await setup();
  assert.equal(
    await store.reserve(delivery(c, 'p', 'a', ['inapp', 'email']), c.updatedAt),
    true,
  );
  const other = { ...c, id: randomUUID() };
  await store.saveCampaign(other, null, actor);
  assert.equal(
    await store.reserve(delivery(other, 'p', 'b'), other.updatedAt),
    false,
  );
  const inflight = (await store.deliveries(c.id))[0]!;
  await store.forget('p');
  await store.finish({ ...inflight, state: 'finished' });
  const saved = await store.deliveries(c.id);
  assert.equal(saved[0]?.heldCents, 500);
  assert.ok(saved[0]?.passengerId.startsWith('erased:'));
  assert.equal(saved[0]?.message, 'Removido');
  await assert.rejects(
    store.saveCampaign({ ...c, budgetCents: 499 }, c.updatedAt, actor),
  );
});
function ride(pid = 'p'): RideRecord {
  return {
    id: randomUUID(),
    passengerId: pid,
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'prea' },
    category: 'moto',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'test',
      baseAmountCents: 2000,
      pickupCompensationCents: 0,
      totalAmountCents: 2000,
      platformCommissionCents: 200,
      driverNetCents: 1800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
test('presente restringe conta e região sem reduzir remuneração do motorista', async () => {
  const promotions = new InMemoryPromotionRepository(),
    rides = new InMemoryRideRepository();
  const c = await promotions.createCampaign({
    ...createPromotionCampaignRecord({
      code: 'PERSONAL',
      name: 'Presente',
      kind: 'fixed_discount',
      valueCents: 500,
      categories: ['moto'],
      maxRedemptions: 1,
      enabled: true,
      now,
    }),
    targetPassengerId: 'p',
    allowedZones: ['prea'],
  });
  const other = await rides.create(ride('other')),
    foreign = await rides.create({ ...ride(), origin: { zoneId: 'jijoca' } }),
    original = await rides.create(ride());
  const args = {
    promotions,
    rides,
    passengerId: 'p',
    clientInstanceId: 'marketing-test-device-0123456789abcdef',
    code: c.code,
    now,
  };
  for (const r of [other, foreign]) {
    await assert.rejects(
      applyPromotionToRide({
        ...args,
        rideId: r.id,
        passengerId: r.passengerId,
      }),
      (e) => e instanceof PromotionError && e.code === 'PROMOTION_NOT_ELIGIBLE',
    );
    assert.deepEqual(await rides.findById(r.id), r);
  }
  const result = await applyPromotionToRide({ ...args, rideId: original.id });
  assert.equal(result.promotion!.passengerPayableCents, 1500);
  assert.equal(result.quote.driverNetCents, 1800);
});
function serviceDeps(
  store: InMemoryGrowthRepository,
  admin: InMemoryAdminRepository,
  privacy: InMemoryPrivacyRepository,
  promotions: InMemoryPromotionRepository,
  send: GrowthDependencies['send'],
): GrowthDependencies {
  const u = customer();
  return {
    store,
    admin,
    privacy,
    promotions,
    identities: {
      findIdentityBySubject: async () => u.identity,
      listIdentities: async () => ({
        identities: [u.identity],
        hasMore: false,
      }),
    },
    rides: {
      listAdminRecentByPassengerId: async () => [],
      getAdminPassengerRideSummary: async () => ({ completed: 0, active: 0 }),
    },
    support: { listByPassenger: async () => [] },
    readiness: () => ({ inapp: true, push: true, email: true, whatsapp: true }),
    send,
  } as unknown as GrowthDependencies;
}
test('execução publica uma vez, limita canais e respeita revogação global', async () => {
  const { store, c, admin } = await setup(),
    privacy = new InMemoryPrivacyRepository(),
    promotions = new InMemoryPromotionRepository();
  await privacy.savePreferences({
    subjectType: 'passenger',
    subjectId: 'p',
    marketingNotificationsEnabled: true,
    updatedAt: now.toISOString(),
  });
  let sends = 0;
  const service = new GrowthService(
    serviceDeps(store, admin, privacy, promotions, async () => {
      sends++;
      return 'published';
    }),
  );
  assert.equal(
    (await service.preview(c.id, now)).candidates[0]?.channels.length,
    2,
  );
  assert.equal(sends, 0);
  assert.equal((await service.execute(c.id, actor, now)).reserved, 1);
  assert.equal(sends, 2);
  assert.equal((await service.execute(c.id, actor, now)).reserved, 0);
  const ds = await store.deliveries();
  assert.equal(
    (await promotions.findCampaignById(ds[0]!.id))?.targetPassengerId,
    'p',
  );
  await privacy.savePreferences({
    subjectType: 'passenger',
    subjectId: 'p',
    marketingNotificationsEnabled: false,
    updatedAt: now.toISOString(),
  });
  assert.ok(
    Object.values((await service.customer('p'))!.preference.channels).every(
      (v) => !v,
    ),
  );
  await service.forget('p');
  assert.equal((await promotions.findCampaignById(ds[0]!.id))?.enabled, false);
});
test('retirada do consentimento entre canais bloqueia próximos envios', async () => {
  const { store, c, admin } = await setup(),
    privacy = new InMemoryPrivacyRepository(),
    promotions = new InMemoryPromotionRepository();
  await privacy.savePreferences({
    subjectType: 'passenger',
    subjectId: 'p',
    marketingNotificationsEnabled: true,
    updatedAt: now.toISOString(),
  });
  let calls = 0;
  const service = new GrowthService(
    serviceDeps(store, admin, privacy, promotions, async () => {
      calls++;
      const p = await store.preference('p');
      p.channels.email = false;
      await store.savePreference(p);
      return 'published';
    }),
  );
  await service.execute(c.id, actor, now);
  assert.equal(calls, 1);
  assert.equal((await store.deliveries())[0]?.results.email, 'skipped');
});
test('canais ficam indisponíveis sem configuração; e-mail simulado gera opt-out assinado', async () => {
  const push = { providerKind: 'disabled' } as PushNotificationService;
  assert.deepEqual(createGrowthChannels(push, {}).readiness(), {
    inapp: true,
    push: false,
    email: false,
    whatsapp: false,
  });
  let payload: { headers: Record<string, string> } | undefined;
  const env = {
    MARKETING_UNSUBSCRIBE_SECRET: 's'.repeat(32),
    MARKETING_PUBLIC_BASE_URL: 'https://example.test',
    MARKETING_EMAIL_PROVIDER: 'resend',
    MARKETING_EMAIL_API_KEY: 'test-only',
    MARKETING_EMAIL_FROM: 'test@example.test',
  };
  const channel = createGrowthChannels(push, env, async (_url, opts) => {
    payload = JSON.parse(opts!.body as string);
    return new Response('{}', { status: 200 });
  });
  assert.equal(
    await channel.send('email', customer(), delivery(campaign()), null),
    'accepted',
  );
  const token = new URL(
    payload!.headers['List-Unsubscribe']!.slice(1, -1),
  ).searchParams.get('token')!;
  assert.deepEqual(channel.verify(token), { id: 'p', ch: 'email' });
  assert.throws(() => channel.verify(token + 'x'));
  assert.throws(() => channel.verify(token + '.extra'));
});

test('automação anual permanece elegível e reserva uma vez por ano, sem renovar orçamento', async () => {
  const { store, c } = await setup();
  const annual = campaignInput({ ...c, repeatAnnually: true }, c, now);
  await store.saveCampaign(annual, c.updatedAt, actor);
  const next = new Date('2028-10-06T15:00:00Z');
  assert.equal(baseEligibility(annual, customer(), next), null);
  assert.equal(campaignOccurrence(annual, customer(), next), '2028');
  assert.notEqual(
    baseEligibility({ ...annual, repeatAnnually: false }, customer(), next),
    null,
  );
  const reserve = (year: string) => ({
    ...delivery(annual, 'p', year, ['inapp']),
    createdAt: `${year}-10-06T15:00:00Z`,
  });
  assert.equal(await store.reserve(reserve('2028'), annual.updatedAt), true);
  assert.equal(await store.reserve(reserve('2028'), annual.updatedAt), false);
  assert.equal(await store.reserve(reserve('2029'), annual.updatedAt), true);
  assert.equal(await store.reserve(reserve('2030'), annual.updatedAt), false);
  assert.equal(
    (await store.deliveries()).reduce((sum, d) => sum + d.heldCents, 0),
    1000,
  );
  assert.throws(() =>
    campaignInput(
      { ...annual, trigger: 'inactive', repeatAnnually: true },
      annual,
      now,
    ),
  );
  const paused = {
    ...annual,
    enabled: false,
    updatedAt: '2026-10-06T15:00:01Z',
  };
  await store.saveCampaign(paused, annual.updatedAt, actor);
  assert.notEqual(baseEligibility(paused, customer(), next), null);
});
