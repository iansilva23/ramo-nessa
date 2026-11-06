import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';
import {
  benefitRegionOptionsFromCatalog,
  driverBenefitCampaignPayload,
  driverBenefitCampaignPatch,
} from '../src/driver-benefits-admin.js';

test('campanha de benefícios preserva categoria, região, missões e prêmio manual', () => {
  const payload = driverBenefitCampaignPayload({
    name: 'Destaques Mototáxi Preá',
    category: 'moto',
    startsAt: '2026-10-01T00:00',
    endsAt: '2026-11-01T00:00',
    regionMode: 'ride',
    participantMode: 'eligible',
    regions: [{ zoneId: 'prea' }],
    participantDriverIds: '',
    excludedDriverIds: 'driver-blocked',
    topCount: '3',
    minParticipants: '5',
    ridePoints: '20',
    fiveStarPoints: '5',
    fourStarPoints: '2',
    cancelMaxPercent: '5',
    cancelBonus: '100',
    missions: 'corridas|50|200|Complete 50 corridas',
    prizes: '1|R$ 500 via Pix\n2|Kit Ramo Nessa',
  });

  assert.equal(payload.category, 'moto');
  assert.deepEqual(payload.regions, [{ zoneId: 'prea' }]);
  assert.equal(payload.lowCancellationMaxBps, 500);
  assert.deepEqual(payload.missions, [{
    id: 'completed_rides-1',
    title: 'Complete 50 corridas',
    kind: 'completed_rides',
    target: 50,
    bonusPoints: 200,
  }]);
  assert.equal(payload.prizes[0].label, 'R$ 500 via Pix');
  assert.equal('amountCents' in payload, false);
  assert.equal('pixKey' in payload, false);
});

test('localidades futuras do catálogo entram nas opções de região', () => {
  const options = benefitRegionOptionsFromCatalog({
    localities: {
      prea: [{ localityId: 'centro', label: 'Centro do Preá' }],
      camocim: [{ localityId: 'maceio', label: 'Maceió' }],
    },
    localityGeofences: [
      { zoneId: 'cruz', localityId: 'caiçara', label: 'Caiçara' },
    ],
  });

  assert.ok(options.some((item) =>
    item.zoneId === 'camocim' && item.localityId === 'maceio',
  ));
  assert.ok(options.some((item) =>
    item.zoneId === 'cruz' && item.localityId === 'caiçara',
  ));
});

test('API de Ranking & Benefícios usa sessão somente no header', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    };
  });

  await api.driverBenefits('session');
  await api.setDriverBenefitsEnabled('session', true);
  await api.createDriverBenefitCampaign('session', { name: 'Teste' });
  await api.setDriverBenefitCampaignStatus('session', 'campaign', 'paused', '2026-10-01T10:00:00.000Z');
  await api.driverBenefitLeaderboard('session', 'campaign');
  await api.setDriverBenefitBase('session', 'driver-1', { zoneId: 'prea' });
  await api.clearDriverBenefitBase('session', 'driver-1');

  assert.equal(calls[0].url, '/v1/admin/driver-benefits');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[3].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[3].options.body), { status: 'paused', expectedUpdatedAt: '2026-10-01T10:00:00.000Z' });
  assert.match(calls[4].url, /leaderboard$/);
  assert.equal(calls[5].options.method, 'PUT');
  assert.equal(calls[6].options.method, 'DELETE');
  for (const call of calls) {
    assert.equal(call.options.headers.authorization, 'Bearer session');
    assert.equal(call.url.includes('session'), false);
  }
});

function formValues() {
  return { name: 'Campanha', category: 'moto', startsAt: '2026-10-01T00:00', endsAt: '2026-11-01T00:00',
    regionMode: 'ride', participantMode: 'eligible', regions: [], participantDriverIds: '', excludedDriverIds: '',
    topCount: '1', minParticipants: '2', ridePoints: '20', fiveStarPoints: '5', fourStarPoints: '2',
    cancelMaxPercent: '5', cancelBonus: '100', missions: 'corridas|50|200|Complete 50 corridas', prizes: '1|Capacete' };
}

test('edição ativa envia somente nome, prêmio informativo e revisão', () => {
  const patch = driverBenefitCampaignPatch({ rulesLocked: true, updatedAt: 'revision' }, formValues());
  assert.deepEqual(patch, { name: 'Campanha', prizes: [{ rank: 1, label: 'Capacete' }], expectedUpdatedAt: 'revision' });
});

test('edição em rascunho preserva ID de missão e revisão', () => {
  const patch = driverBenefitCampaignPatch({ rulesLocked: false, updatedAt: 'revision',
    startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z',
    missions: [{ id: 'original-mission', kind: 'completed_rides', title: 'Complete 50 corridas' }] }, formValues());
  assert.equal(patch.missions[0].id, 'original-mission');
  assert.equal(patch.expectedUpdatedAt, 'revision');
});

test('prêmio fora do Top não gera configuração contraditória', () => {
  assert.throws(() => driverBenefitCampaignPayload({ ...formValues(), prizes: '2|Capacete' }), /dentro do Top/);
});
