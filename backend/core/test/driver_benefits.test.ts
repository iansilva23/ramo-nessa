import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import {
  createDriverBenefitCampaign,
  setDriverBenefitCampaignStatus,
  setDriverBenefitsGlobalEnabled,
  updateDriverBenefitCampaign,
  parseCreateDriverBenefitCampaign,
} from '../src/admin/admin-driver-benefits-service.js';
import { InMemoryDriverBenefitRepository } from '../src/benefits/repositories/in-memory-driver-benefit-repository.js';
import {
  driverBenefitsForApp,
  effectiveDriverBenefitStatus,
  driverBenefitLeaderboard,
  finalizeEndedDriverBenefitCampaigns,
} from '../src/benefits/driver-benefit-service.js';

const actor = {
  kind: 'user' as const,
  id: 'owner-benefits',
  name: 'Owner Benefits',
};

function campaignBody() {
  return {
    name: 'Destaques Mototáxi Preá',
    category: 'moto',
    regionMode: 'ride',
    participantMode: 'eligible',
    regions: [{ zoneId: 'prea' }],
    participantDriverIds: [],
    excludedDriverIds: [],
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2026-11-01T00:00:00.000Z',
    topCount: 3,
    minParticipants: 2,
    ridePoints: 20,
    fiveStarPoints: 5,
    fourStarPoints: 2,
    lowCancellationMaxBps: 500,
    lowCancellationBonusPoints: 100,
    missions: [
      {
        id: 'rides-50',
        title: 'Complete 50 corridas',
        kind: 'completed_rides',
        target: 50,
        bonusPoints: 200,
      },
    ],
    prizes: [
      { rank: 1, label: 'R$ 500 via Pix (pagamento manual)' },
      { rank: 2, label: 'Kit Ramo Nessa' },
    ],
  };
}

test('módulo nasce desligado e campanha nasce em rascunho', async () => {
  const repository = new InMemoryDriverBenefitRepository();
  const admin = new InMemoryAdminRepository();

  assert.equal((await repository.getSettings()).enabled, false);

  const campaign = await createDriverBenefitCampaign({
    repository,
    admin,
    actor,
    body: campaignBody(),
    now: new Date('2026-09-30T12:00:00.000Z'),
  });

  assert.equal(campaign.status, 'draft');
  assert.equal(
    effectiveDriverBenefitStatus(
      campaign,
      new Date('2026-10-10T12:00:00.000Z'),
    ),
    'draft',
  );
});

test('campanha agendada ativa sozinha no período e ranking é calculado sem financeiro', async () => {
  const repository = new InMemoryDriverBenefitRepository();
  const admin = new InMemoryAdminRepository();

  const campaign = await createDriverBenefitCampaign({
    repository,
    admin,
    actor,
    body: campaignBody(),
    now: new Date('2026-09-30T12:00:00.000Z'),
  });

  await setDriverBenefitsGlobalEnabled({
    repository,
    admin,
    actor,
    body: { enabled: true },
    now: new Date('2026-09-30T12:01:00.000Z'),
  });

  const scheduled = await setDriverBenefitCampaignStatus({
    repository,
    admin,
    actor,
    id: campaign.id,
    body: { status: 'scheduled', expectedUpdatedAt: campaign.updatedAt },
    now: new Date('2026-09-30T12:02:00.000Z'),
  });

  repository.setRankingStats(campaign.id, [
    {
      driverId: 'driver-a',
      displayName: 'João da Silva',
      completedRides: 50,
      cancelledByDriver: 1,
      fiveStarRatings: 10,
      fourStarRatings: 3,
      ratingSum: 62,
      ratingCount: 13,
    },
    {
      driverId: 'driver-b',
      displayName: 'Carlos Souza',
      completedRides: 45,
      cancelledByDriver: 4,
      fiveStarRatings: 8,
      fourStarRatings: 2,
      ratingSum: 48,
      ratingCount: 10,
    },
  ]);

  assert.equal(
    effectiveDriverBenefitStatus(
      scheduled,
      new Date('2026-10-10T12:00:00.000Z'),
    ),
    'active',
  );

  const view = await driverBenefitsForApp({
    repository,
    driverId: 'driver-a',
    now: new Date('2026-10-10T12:00:00.000Z'),
  });

  assert.equal(view.enabled, true);
  assert.equal(view.campaigns.length, 1);
  const active = view.campaigns[0];
  assert.ok(active != null);
  assert.equal(active.me.rank, 1);
  assert.ok(active.me.points > 0);
  assert.equal(active.prizesUnlocked, true);
});

const during = new Date('2026-10-10T12:00:00.000Z');
function stats(driverId: string, overrides = {}) {
  return { driverId, displayName: 'João da Silva', completedRides: 10,
    cancelledByDriver: 0, fiveStarRatings: 2, fourStarRatings: 1,
    ratingSum: 14, ratingCount: 3, ...overrides };
}
async function fixture(overrides = {}) {
  const repository = new InMemoryDriverBenefitRepository();
  const admin = new InMemoryAdminRepository();
  const campaign = await createDriverBenefitCampaign({ repository, admin, actor,
    body: { ...campaignBody(), ...overrides }, now: new Date('2026-09-30T12:00:00Z') });
  await setDriverBenefitsGlobalEnabled({ repository, admin, actor, body: { enabled: true } });
  const active = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'scheduled', expectedUpdatedAt: campaign.updatedAt }, now: new Date('2026-09-30T13:00:00Z') });
  return { repository, admin, campaign: active };
}

test('OFF não consulta nem expõe ranking e reativação preserva os pontos', async () => {
  const { repository, admin, campaign } = await fixture();
  repository.setRankingStats(campaign.id, [stats('own')]);
  await setDriverBenefitsGlobalEnabled({ repository, admin, actor, body: { enabled: false } });
  const original = repository.rankingStats.bind(repository);
  repository.rankingStats = async () => { throw new Error('Não deve consultar ranking quando OFF'); };
  assert.deepEqual(await driverBenefitsForApp({ repository, driverId: 'own', now: during }),
    { enabled: false, campaigns: [], history: [] });
  repository.rankingStats = original;
  await setDriverBenefitsGlobalEnabled({ repository, admin, actor, body: { enabled: true } });
  const view = await driverBenefitsForApp({ repository, driverId: 'own', now: during });
  assert.equal(view.campaigns[0]?.me.points, 312);
});

test('pontuação, qualidade, missões, desempate e Top 20 + posição própria são transparentes e privados', async () => {
  const { repository, campaign } = await fixture();
  repository.setRankingStats(campaign.id, [
    ...Array.from({ length: 22 }, (_, i) => stats(`driver-${String(i).padStart(2, '0')}`,
      { completedRides: 50, fiveStarRatings: 10, fourStarRatings: 3, ratingSum: 62, ratingCount: 13 })),
    stats('own', { cancelledByDriver: 4 }),
  ].reverse());
  const view = await driverBenefitsForApp({ repository, driverId: 'own', now: during });
  const active = view.campaigns[0]!;
  assert.equal(active.me.rank, 23);
  assert.equal(active.me.points, 212);
  assert.deepEqual(active.me.breakdown, { ridePoints: 200, fiveStarPoints: 10, fourStarPoints: 2,
    lowCancellationBonusPoints: 0, missionPoints: 0 });
  assert.equal(active.me.missions[0]?.current, 10);
  assert.equal(active.me.missions[0]?.completed, false);
  assert.equal(active.me.gapToNextPoints, 1144);
  assert.equal(active.leaderboard.length, 21);
  assert.equal(active.leaderboard.at(-1)?.isMe, true);
  assert.equal(active.leaderboard[0]?.displayName, 'João S.');
  assert.equal('driverId' in active.leaderboard[0]!, false);
  const adminView = await driverBenefitLeaderboard({ repository, campaignId: campaign.id, now: during });
  assert.equal(adminView.leaderboard[0]?.driverId, 'driver-00');
  assert.equal(adminView.leaderboard[0]?.breakdown.missionPoints, 200);
  assert.equal(adminView.leaderboard[0]?.missions[0]?.completed, true);
  assert.equal(JSON.stringify(active).includes('da Silva'), false);
});

test('revisão impede edições stale, inclusive concorrentes, sem sobrescrever a primeira', async () => {
  const repository = new InMemoryDriverBenefitRepository();
  const admin = new InMemoryAdminRepository();
  const campaign = await createDriverBenefitCampaign({ repository, admin, actor, body: campaignBody() });
  const requests = ['Operador A', 'Operador B'].map(name => updateDriverBenefitCampaign({
    repository, admin, actor, id: campaign.id, body: { name, expectedUpdatedAt: campaign.updatedAt },
  }));
  const results = await Promise.allSettled(requests);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await repository.findCampaign(campaign.id))?.name, 'Operador A');
  await assert.rejects(setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'active', expectedUpdatedAt: campaign.updatedAt } }), { code: 'DRIVER_BENEFIT_CONFLICT' });
});

test('regras de uma campanha iniciada ficam protegidas, incluindo após pausar', async () => {
  const { repository, admin, campaign } = await fixture();
  for (const patch of [{ category: 'car' }, { ridePoints: 1000 }, { regions: [] },
    { startsAt: '2026-09-01T00:00:00Z' }, { excludedDriverIds: ['driver'] }]) {
    await assert.rejects(updateDriverBenefitCampaign({ repository, admin, actor, id: campaign.id,
      body: { ...patch, expectedUpdatedAt: campaign.updatedAt }, now: during }), { code: 'DRIVER_BENEFIT_RULES_LOCKED' });
  }
  const paused = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'paused', expectedUpdatedAt: campaign.updatedAt }, now: during });
  repository.setRankingStats(campaign.id, [stats('own')]);
  assert.equal((await driverBenefitsForApp({ repository, driverId: 'own', now: during })).campaigns.length, 0);
  assert.ok(paused.rulesLockedAt);
  await assert.rejects(setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'draft', expectedUpdatedAt: paused.updatedAt }, now: during }), { code: 'DRIVER_BENEFIT_RULES_LOCKED' });
  const resumed = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'active', expectedUpdatedAt: paused.updatedAt }, now: during });
  const renamed = await updateDriverBenefitCampaign({ repository, admin, actor, id: campaign.id,
    body: { name: 'Novo nome público', expectedUpdatedAt: resumed.updatedAt }, now: during });
  assert.equal(renamed.ridePoints, campaign.ridePoints);
  assert.equal((await driverBenefitsForApp({ repository, driverId: 'own', now: during })).campaigns[0]?.me.points, 312);
});

test('encerramento preserva classificação, mínimo e Top N sem reabrir ou integrar financeiro', async () => {
  const { repository, admin, campaign } = await fixture({ topCount: 1, prizes: [{ rank: 1, label: 'R$ 500 via Pix' }] });
  repository.setRankingStats(campaign.id, [stats('own'), stats('other', { displayName: 'Ana Costa' })]);
  const ended = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'ended', expectedUpdatedAt: campaign.updatedAt }, now: during });
  repository.setRankingStats(campaign.id, []);
  const view = await driverBenefitsForApp({ repository, driverId: 'own', now: during });
  assert.equal(view.campaigns.length, 0);
  assert.equal(view.history[0]?.winners.length, 1);
  assert.equal(view.history[0]?.participantCount, 2);
  assert.equal(view.history[0]?.prizes[0]?.label, 'R$ 500 via Pix');
  await assert.rejects(setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
    body: { status: 'active', expectedUpdatedAt: ended.updatedAt }, now: during }), { code: 'DRIVER_BENEFIT_RULES_LOCKED' });
  await assert.rejects(updateDriverBenefitCampaign({ repository, admin, actor, id: campaign.id,
    body: { name: 'Reescrever histórico', expectedUpdatedAt: ended.updatedAt }, now: during }), { code: 'DRIVER_BENEFIT_RULES_LOCKED' });
});

test('mínimo insuficiente não anuncia vencedores e fim automático é preservado mesmo com módulo OFF', async () => {
  const { repository, campaign } = await fixture({ minParticipants: 5 });
  repository.setRankingStats(campaign.id, [stats('own')]);
  const later = new Date('2026-11-02T12:00:00Z');
  await repository.updateSettings({ enabled: false, updatedAt: later.toISOString() });
  await finalizeEndedDriverBenefitCampaigns(repository, later);
  repository.setRankingStats(campaign.id, [stats('own', { completedRides: 999 })]);
  await repository.updateSettings({ enabled: true, updatedAt: later.toISOString() });
  const history = (await driverBenefitsForApp({ repository, driverId: 'own', now: later })).history;
  assert.equal(history[0]?.me.points, 312);
  assert.equal(history[0]?.prizesUnlocked, false);
  assert.deepEqual(history[0]?.winners, []);
});

test('histórico prioriza os seis encerramentos efetivos mais recentes', async () => {
  const { repository, admin } = await fixture();
  const endedIds: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const campaign = await createDriverBenefitCampaign({ repository, admin, actor,
      body: { ...campaignBody(), name: `Campanha histórica ${index}`,
        endsAt: index === 0 ? '2027-03-01T00:00:00Z' : '2026-11-01T00:00:00Z' },
      now: new Date('2026-09-30T12:00:00Z') });
    const active = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
      body: { status: 'active', expectedUpdatedAt: campaign.updatedAt },
      now: new Date('2026-10-01T12:00:00Z') });
    repository.setRankingStats(campaign.id, [stats('own')]);
    await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
      body: { status: 'ended', expectedUpdatedAt: active.updatedAt },
      now: new Date(`2026-10-0${index + 2}T12:00:00Z`) });
    endedIds.push(campaign.id);
  }
  const history = (await driverBenefitsForApp({ repository, driverId: 'own', now: during })).history;
  assert.deepEqual(history.map(item => item.id), endedIds.slice(1).reverse());
  assert.equal(history[0]?.endsAt, '2026-10-08T12:00:00.000Z');
});

test('seleção, missões inválidas e prêmios fora do Top são rejeitados sem automação financeira', () => {
  for (const patch of [{ participantMode: 'selected', participantDriverIds: [] },
    { missions: [{ id: 'unsafe', title: 'Dirija mais rápido', kind: 'speed', target: 50, bonusPoints: 20 }] },
    { topCount: 1, prizes: [{ rank: 2, label: 'Capacete' }] }]) {
    assert.throws(() => parseCreateDriverBenefitCampaign({ ...campaignBody(), ...patch }), { code: 'INVALID_DRIVER_BENEFIT' });
  }
});
