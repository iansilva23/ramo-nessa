import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import {
  createDriverBenefitCampaign,
  setDriverBenefitCampaignStatus,
  setDriverBenefitsGlobalEnabled,
} from '../src/admin/admin-driver-benefits-service.js';
import { InMemoryDriverBenefitRepository } from '../src/benefits/repositories/in-memory-driver-benefit-repository.js';
import {
  driverBenefitsForApp,
  effectiveDriverBenefitStatus,
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
    body: { status: 'scheduled' },
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
