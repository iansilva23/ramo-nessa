import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { PromotionRepositoryError } from '../src/promotions/promotion-repository.js';
import {
  applyPromotionToRide, createPromotionCampaignRecord, PromotionError,
  promotionDeviceHash, savePassengerPromotionPreference,
} from '../src/promotions/promotion-service.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-10-01T05:00:00.000Z');
const device = 'audit-eligibility-device-0123456789abcdef';
const defaults = {
  code: 'AUDIT7', name: 'Eligibility audit', kind: 'fixed_discount' as const,
  valueCents: 700, categories: ['car'] as ['car'],
  maxRedemptions: 10, perPassengerLimit: 10, perDeviceLimit: 10, enabled: true, now,
};

function ride(passengerId = 'audit-passenger'): RideRecord {
  return {
    id: randomUUID(), passengerId, state: 'AWAITING_PAYMENT', paymentStatus: 'created',
    driverHoldExpiresAt: '2026-10-01T05:05:00.000Z',
    origin: {zoneId: 'prea'}, destination: {zoneId: 'jijoca'}, category: 'car', period: 'day', passengers: 1,
    quote: {ruleId: 'audit', baseAmountCents: 2000, pickupCompensationCents: 0,
      totalAmountCents: 2000, platformCommissionCents: 200, driverNetCents: 1800},
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

for (const invalid of [
  {name: 'desativada', overrides: {enabled: false}, error: 'PROMOTION_NOT_ACTIVE'},
  {name: 'expirada', overrides: {endsAt: now.toISOString()}, error: 'PROMOTION_NOT_ACTIVE'},
  {name: 'futura', overrides: {startsAt: '2026-10-02T05:00:00.000Z'}, error: 'PROMOTION_NOT_ACTIVE'},
  {name: 'categoria incompatível', overrides: {categories: ['moto'] as ['moto']}, error: 'PROMOTION_NOT_ELIGIBLE'},
]) {
  test(`campanha ${invalid.name} é rejeitada sem alterar corrida`, async () => {
    const promotions = new InMemoryPromotionRepository();
    const rides = new InMemoryRideRepository();
    const campaign = await promotions.createCampaign(createPromotionCampaignRecord({...defaults, ...invalid.overrides}));
    const original = await rides.create(ride());
    await assert.rejects(applyPromotionToRide({
      promotions, rides, rideId: original.id, passengerId: original.passengerId,
      clientInstanceId: device, code: campaign.code, now,
    }), (error: unknown) => error instanceof PromotionError && error.code === invalid.error);
    assert.deepEqual(await rides.findById(original.id), original);
    assert.equal(await promotions.findRedemptionByRideId(original.id), null);
  });
}

for (const limit of [
  {name: 'total', overrides: {maxRedemptions: 1}, passenger: 'other-passenger', otherDevice: `${device}-other`, error: 'PROMOTION_LIMIT_REACHED'},
  {name: 'passageiro', overrides: {perPassengerLimit: 1}, passenger: 'audit-passenger', otherDevice: `${device}-other`, error: 'PROMOTION_PASSENGER_LIMIT_REACHED'},
  {name: 'aparelho', overrides: {perDeviceLimit: 1}, passenger: 'other-passenger', otherDevice: device, error: 'PROMOTION_DEVICE_LIMIT_REACHED'},
]) {
  test(`limite por ${limit.name} bloqueia uso adicional e aplicação repetida é idempotente`, async () => {
    const promotions = new InMemoryPromotionRepository();
    const rides = new InMemoryRideRepository();
    const campaign = await promotions.createCampaign(createPromotionCampaignRecord({...defaults, ...limit.overrides}));
    const original = await rides.create(ride());
    const input = {promotions, rides, rideId: original.id, passengerId: original.passengerId,
      clientInstanceId: device, code: campaign.code, now};
    const first = await applyPromotionToRide(input);
    assert.deepEqual(await applyPromotionToRide(input), first);
    const next = await rides.create(ride(limit.passenger));
    await assert.rejects(applyPromotionToRide({...input, rideId: next.id,
      passengerId: next.passengerId, clientInstanceId: limit.otherDevice}),
      (error: unknown) => error instanceof PromotionRepositoryError && error.code === limit.error);
    assert.equal((await promotions.findRedemptionById(first.promotion!.applicationId))?.status, 'reserved');
    assert.equal(await promotions.findRedemptionByRideId(next.id), null);
  });
}

test('identificação do aparelho é validada e persistida somente como hash', async () => {
  const promotions = new InMemoryPromotionRepository();
  const campaign = await promotions.createCampaign(createPromotionCampaignRecord(defaults));
  await assert.rejects(savePassengerPromotionPreference({
    promotions, passengerId: 'audit-passenger', clientInstanceId: 'short', code: campaign.code, now,
  }), (error: unknown) => error instanceof PromotionError && error.code === 'PROMOTION_REQUIRES_DEVICE');
  assert.equal(await promotions.getPreference('audit-passenger'), null);
  await savePassengerPromotionPreference({
    promotions, passengerId: 'audit-passenger', clientInstanceId: device, code: campaign.code, now,
  });
  const preference = await promotions.getPreference('audit-passenger');
  assert.match(preference!.deviceHash, /^[a-f0-9]{64}$/);
  assert.equal(preference!.deviceHash, promotionDeviceHash(device));
  assert.equal(JSON.stringify(preference).includes(device), false);
});

test('reserva não paga expirada libera capacidade da campanha', async () => {
  const promotions = new InMemoryPromotionRepository();
  const rides = new InMemoryRideRepository();
  const campaign = await promotions.createCampaign(createPromotionCampaignRecord({...defaults, maxRedemptions: 1}));
  const first = await rides.create(ride());
  await applyPromotionToRide({promotions, rides, rideId: first.id, passengerId: first.passengerId,
    clientInstanceId: device, code: campaign.code, now});
  const next = await rides.create({...ride('another-passenger'), driverHoldExpiresAt: '2026-10-01T05:10:00.000Z'});
  const promoted = await applyPromotionToRide({promotions, rides, rideId: next.id, passengerId: next.passengerId,
    clientInstanceId: `${device}-other`, code: campaign.code, now: new Date(now.getTime() + 6 * 60 * 1000)});
  assert.equal(promoted.promotion!.passengerPayableCents, 1300);
});
