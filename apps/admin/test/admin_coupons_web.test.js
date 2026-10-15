import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionPayload, moneyCents } from '../src/promotions-admin.js';
import { createAdminApi } from '../src/api.js';
const defaults = {
  code: 'SAVE7',
  name: 'Campanha teste',
  maxRedemptions: '10',
  perPassengerLimit: '1',
  perDeviceLimit: '1',
  cap: '',
  categories: [],
  startsAt: '',
  endsAt: '',
};
test('formulário envia cinco tipos sem misturar valores financeiros', () => {
  assert.equal(
    promotionPayload({ ...defaults, kind: 'wallet_credit', value: '7,00' })
      .valueCents,
    700,
  );
  assert.equal(
    promotionPayload({ ...defaults, kind: 'fixed_discount', value: '7.25' })
      .valueCents,
    725,
  );
  const percent = promotionPayload({
    ...defaults,
    kind: 'percent_discount',
    percent: '20,50',
    cap: '10',
  });
  assert.equal(percent.percentBps, 2050);
  assert.equal(percent.maxDiscountCents, 1000);
  assert.equal(
    promotionPayload({ ...defaults, kind: 'free_ride', value: '200' })
      .valueCents,
    undefined,
  );
  const fixed = promotionPayload({
    ...defaults,
    kind: 'fixed_driver_fare',
    categories: ['car', 'moto'],
    fares: { car: '50', moto: '10' },
  });
  assert.deepEqual(fixed.fixedDriverFaresByCategory, { car: 5000, moto: 1000 });
  assert.equal(fixed.enabled, false);
  assert.throws(() =>
    promotionPayload({
      ...defaults,
      kind: 'fixed_driver_fare',
      categories: ['car'],
      fares: {},
    }),
  );
  assert.throws(() =>
    promotionPayload({ ...defaults, kind: 'percent_discount', percent: '101' }),
  );
  assert.throws(() =>
    promotionPayload({ ...defaults, kind: 'free_ride', maxRedemptions: '0' }),
  );
  assert.throws(() => moneyCents('7,001'));
  assert.throws(() => moneyCents('-7'));
  assert.throws(() => moneyCents(''));
});
test('API consulta cria e ativa campanha com sessão somente no header', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ campaigns: [] }),
    };
  });
  await api.listPromotions('session');
  await api.createPromotion('session', { code: 'SAVE7' });
  await api.setPromotionEnabled('session', 'id', true);
  assert.equal(calls[0].url, '/v1/admin/promotions');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].url, '/v1/admin/promotions/id/enabled');
  assert.equal(calls[2].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[2].options.body), { enabled: true });
  for (const call of calls) {
    assert.equal(call.options.headers.authorization, 'Bearer session');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.url.includes('session'), false);
  }
});
