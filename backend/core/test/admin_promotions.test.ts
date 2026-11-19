import { publicPromotionCampaignView } from '../src/promotions/promotion-service.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAdminPromotion,
  parseAdminPromotionEnabled,
  createAdminPromotion,
  setAdminPromotionEnabled,
} from '../src/admin/admin-promotions-service.js';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { applyPromotionToRide } from '../src/promotions/promotion-service.js';
import type { RideRecord } from '../src/rides/ride.js';
const defaults = { code: 'ADMIN7', name: 'Campanha Admin', maxRedemptions: 10 };
const actor = { kind: 'user' as const, id: 'owner', name: 'Ian' };
for (const [kind, values] of Object.entries({
  wallet_credit: { valueCents: 700 },
  fixed_discount: { valueCents: 700 },
  percent_discount: { percentBps: 2000, maxDiscountCents: 1000 },
  free_ride: {},
  fixed_driver_fare: {
    categories: ['car', 'moto'],
    fixedDriverFaresByCategory: { car: 5000, moto: 1000 },
  },
})) {
  test(`Admin cria ${kind} desativado e registra ativação sem alterar valores`, async () => {
    const promotions = new InMemoryPromotionRepository();
    const admin = new InMemoryAdminRepository();
    const campaign = await createAdminPromotion({
      promotions,
      admin,
      actor,
      body: { ...defaults, kind, ...values },
    });
    assert.equal(campaign.enabled, false);
    const enabled = await setAdminPromotionEnabled({
      promotions,
      admin,
      actor,
      id: campaign.id,
      body: { enabled: true },
    });
    assert.deepEqual(
      { ...enabled, enabled: false, updatedAt: campaign.updatedAt },
      campaign,
    );
    assert.equal((await promotions.listCampaigns()).length, 1);
    const audit = await admin.listAudit(10);
    assert.equal(audit.length, 2);
    assert.ok(audit.every((item) => item.actor.id === 'owner'));
    await assert.rejects(
      createAdminPromotion({
        promotions,
        admin,
        actor,
        body: { ...defaults, kind, ...values },
      }),
    );
    assert.equal((await promotions.listCampaigns()).length, 1);
  });
}
test('Admin rejeita tipos, limites, campos extras e tarifas incoerentes', () => {
  for (const invalid of [
    null,
    [],
    {},
    { ...defaults, kind: 'free_ride', maxRedemptions: undefined },
    { ...defaults, kind: 'free_ride', enabled: 'true' },
    { ...defaults, kind: 'fixed_discount', valueCents: '700' },
    { ...defaults, kind: 'free_ride', valueCents: 1 },
    { ...defaults, kind: 'free_ride', perPassengerLimit: 0 },
    { ...defaults, kind: 'percent_discount', percentBps: 10001 },
    {
      ...defaults,
      kind: 'free_ride',
      startsAt: '2026-10-02',
      endsAt: '2026-10-01',
    },
    {
      ...defaults,
      kind: 'fixed_driver_fare',
      categories: ['car', 'moto'],
      fixedDriverFaresByCategory: { car: 5000 },
    },
    {
      ...defaults,
      kind: 'fixed_driver_fare',
      categories: ['car'],
      fixedDriverFaresByCategory: { car: 0 },
    },
    {
      ...defaults,
      kind: 'fixed_driver_fare',
      categories: ['car'],
      fixedDriverFaresByCategory: { car: 1.5 },
    },
    {
      ...defaults,
      kind: 'fixed_driver_fare',
      categories: ['car'],
      fixedDriverFaresByCategory: { car: 5000, moto: 1000 },
    },
    { ...defaults, kind: 'free_ride', driverNetCents: 1 },
  ])
    assert.throws(() => parseAdminPromotion(invalid));
  assert.throws(() => parseAdminPromotionEnabled({ enabled: 'false' }));
  assert.throws(() =>
    parseAdminPromotionEnabled({ enabled: true, valueCents: 1 }),
  );
});
test('Um código aplica a tarifa da categoria com comissão zero e ganho integral', async () => {
  const promotions = new InMemoryPromotionRepository();
  const admin = new InMemoryAdminRepository();
  const campaign = await createAdminPromotion({
    promotions,
    admin,
    actor,
    body: {
      ...defaults,
      kind: 'fixed_driver_fare',
      enabled: true,
      categories: ['car', 'moto'],
      fixedDriverFaresByCategory: { car: 5000, moto: 1000 },
    },
  });
  const now = new Date('2026-10-01T05:00:00Z');
  const rides = new InMemoryRideRepository();
  for (const [category, expected] of [
    ['car', 5000],
    ['moto', 1000],
  ] as const) {
    const ride: RideRecord = {
      id: `ride-${category}`,
      passengerId: `passenger-${category}`,
      category,
      state: 'AWAITING_PAYMENT',
      paymentStatus: 'created',
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jijoca' },
      period: 'day',
      passengers: 1,
      driverHoldExpiresAt: '2026-10-01T05:05:00Z',
      quote: {
        ruleId: 'normal',
        baseAmountCents: 20000,
        totalAmountCents: 20000,
        driverNetCents: 18000,
        platformCommissionCents: 2000,
        pickupCompensationCents: 0,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await rides.create(ride);
    const result = await applyPromotionToRide({
      promotions,
      rides,
      rideId: ride.id,
      passengerId: ride.passengerId,
      clientInstanceId: `device-0123456789abcdef0123456789-${category}`,
      code: campaign.code,
      now,
    });
    assert.equal(result.quote.totalAmountCents, expected);
    assert.equal(result.quote.driverNetCents, expected);
    assert.equal(result.quote.platformCommissionCents, 0);
    assert.equal(result.promotion!.passengerPayableCents, expected);
  }
});

test('perfil de apps antigos não anuncia a menor tarifa como preço universal', () => {
  const campaign = parseAdminPromotion({
    ...defaults,
    kind: 'fixed_driver_fare',
    categories: ['car', 'moto'],
    fixedDriverFaresByCategory: { car: 5000, moto: 1000 },
  });
  const view = publicPromotionCampaignView(campaign);
  assert.equal(view.fixedDriverFareCents, undefined);
  assert.deepEqual(view.fixedDriverFaresByCategory, { car: 5000, moto: 1000 });
  const legacy = parseAdminPromotion({
    ...defaults,
    kind: 'fixed_driver_fare',
    categories: ['car'],
    fixedDriverFareCents: 5000,
  });
  assert.equal(publicPromotionCampaignView(legacy).fixedDriverFareCents, 5000);
});
