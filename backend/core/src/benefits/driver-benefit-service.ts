import type {
  DriverBenefitCampaignRecord,
  DriverBenefitCampaignStatus,
  DriverBenefitMission,
  DriverBenefitPrize,
  DriverBenefitRepository,
  DriverBenefitStatsRecord,
} from './driver-benefit-repository.js';

export class DriverBenefitError extends Error {
  constructor(
    public readonly code:
      | 'DRIVER_BENEFIT_NOT_FOUND'
      | 'INVALID_DRIVER_BENEFIT'
      | 'INVALID_DRIVER_BENEFIT_BASE',
    message: string,
  ) {
    super(message);
    this.name = 'DriverBenefitError';
  }
}

function publicName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? 'Motorista';
  const last = parts[parts.length - 1] ?? '';
  return `${parts[0]} ${last.slice(0, 1).toUpperCase()}.`;
}

export function effectiveDriverBenefitStatus(
  campaign: DriverBenefitCampaignRecord,
  now = new Date(),
): DriverBenefitCampaignStatus {
  if (campaign.status === 'draft') return 'draft';
  if (campaign.status === 'paused') return 'paused';
  if (campaign.status === 'ended') return 'ended';

  const instant = now.getTime();
  const starts = Date.parse(campaign.startsAt);
  const ends = Date.parse(campaign.endsAt);

  if (instant >= ends) return 'ended';
  if (instant < starts) return 'scheduled';
  return 'active';
}

function missionProgress(
  mission: DriverBenefitMission,
  stats: DriverBenefitStatsRecord,
) {
  const current =
    mission.kind === 'completed_rides'
      ? stats.completedRides
      : stats.fiveStarRatings;
  return {
    id: mission.id,
    title: mission.title,
    kind: mission.kind,
    target: mission.target,
    current,
    bonusPoints: mission.bonusPoints,
    completed: current >= mission.target,
  };
}

function score(
  campaign: DriverBenefitCampaignRecord,
  stats: DriverBenefitStatsRecord,
) {
  const activity = stats.completedRides + stats.cancelledByDriver;
  const cancellationRateBps =
    activity === 0
      ? 0
      : Math.round((stats.cancelledByDriver * 10000) / activity);
  const lowCancellationBonus =
    activity > 0 &&
    cancellationRateBps <= campaign.lowCancellationMaxBps
      ? campaign.lowCancellationBonusPoints
      : 0;
  const missions = campaign.missions.map((mission) =>
    missionProgress(mission, stats),
  );
  const missionPoints = missions
    .filter((mission) => mission.completed)
    .reduce((total, mission) => total + mission.bonusPoints, 0);
  const ridePoints = stats.completedRides * campaign.ridePoints;
  const fiveStarPoints =
    stats.fiveStarRatings * campaign.fiveStarPoints;
  const fourStarPoints =
    stats.fourStarRatings * campaign.fourStarPoints;
  const points =
    ridePoints +
    fiveStarPoints +
    fourStarPoints +
    lowCancellationBonus +
    missionPoints;
  const ratingAverage =
    stats.ratingCount === 0
      ? 0
      : stats.ratingSum / stats.ratingCount;

  return {
    ...stats,
    displayName: publicName(stats.displayName),
    points,
    ratingAverage,
    cancellationRateBps,
    breakdown: {
      ridePoints,
      fiveStarPoints,
      fourStarPoints,
      lowCancellationBonusPoints: lowCancellationBonus,
      missionPoints,
    },
    missions,
  };
}

function rankedCampaign(
  campaign: DriverBenefitCampaignRecord,
  stats: DriverBenefitStatsRecord[],
) {
  const scored = stats
    .map((item) => score(campaign, item))
    .sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.completedRides !== b.completedRides) {
        return b.completedRides - a.completedRides;
      }
      if (a.ratingAverage !== b.ratingAverage) {
        return b.ratingAverage - a.ratingAverage;
      }
      return a.driverId.localeCompare(b.driverId);
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    entries: scored,
    participantCount: scored.length,
    prizesUnlocked: scored.length >= campaign.minParticipants,
  };
}

function campaignPublicView(
  campaign: DriverBenefitCampaignRecord,
  now: Date,
) {
  return {
    id: campaign.id,
    name: campaign.name,
    category: campaign.category,
    regions: campaign.regions,
    regionMode: campaign.regionMode,
    participantMode: campaign.participantMode,
    status: campaign.status,
    effectiveStatus: effectiveDriverBenefitStatus(campaign, now),
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    topCount: campaign.topCount,
    minParticipants: campaign.minParticipants,
    scoring: {
      ridePoints: campaign.ridePoints,
      fiveStarPoints: campaign.fiveStarPoints,
      fourStarPoints: campaign.fourStarPoints,
      lowCancellationMaxBps: campaign.lowCancellationMaxBps,
      lowCancellationBonusPoints:
        campaign.lowCancellationBonusPoints,
    },
    missions: campaign.missions,
    prizes: campaign.prizes,
  };
}

export async function driverBenefitsAdminView(input: {
  repository: DriverBenefitRepository;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [settings, campaigns] = await Promise.all([
    input.repository.getSettings(),
    input.repository.listCampaigns(),
  ]);
  return {
    settings,
    campaigns: campaigns.map((campaign) => ({
      ...campaignPublicView(campaign, now),
      participantDriverIds: campaign.participantDriverIds,
      excludedDriverIds: campaign.excludedDriverIds,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    })),
  };
}

export async function driverBenefitLeaderboard(input: {
  repository: DriverBenefitRepository;
  campaignId: string;
  now?: Date;
}) {
  const campaign = await input.repository.findCampaign(input.campaignId);
  if (campaign == null) {
    throw new DriverBenefitError(
      'DRIVER_BENEFIT_NOT_FOUND',
      'Campanha de Ranking & Benefícios não encontrada.',
    );
  }
  const stats = await input.repository.rankingStats(campaign);
  const ranked = rankedCampaign(campaign, stats);
  return {
    campaign: {
      ...campaignPublicView(
        campaign,
        input.now ?? new Date(),
      ),
      participantDriverIds: campaign.participantDriverIds,
      excludedDriverIds: campaign.excludedDriverIds,
    },
    participantCount: ranked.participantCount,
    prizesUnlocked: ranked.prizesUnlocked,
    leaderboard: ranked.entries.slice(0, 50),
  };
}

function driverCampaignView(
  campaign: DriverBenefitCampaignRecord,
  stats: DriverBenefitStatsRecord[],
  driverId: string,
  now: Date,
) {
  const ranked = rankedCampaign(campaign, stats);
  const own = ranked.entries.find(
    (entry) => entry.driverId === driverId,
  );
  if (own == null) return null;

  const previous =
    own.rank > 1 ? ranked.entries[own.rank - 2] : undefined;
  const top = ranked.entries.slice(0, 20);
  if (!top.some((entry) => entry.driverId === driverId)) {
    top.push(own);
  }

  return {
    ...campaignPublicView(campaign, now),
    participantCount: ranked.participantCount,
    prizesUnlocked: ranked.prizesUnlocked,
    leaderboard: top.map((entry) => ({
      rank: entry.rank,
      displayName: entry.displayName,
      points: entry.points,
      completedRides: entry.completedRides,
      ratingAverage: entry.ratingAverage,
      isMe: entry.driverId === driverId,
    })),
    me: {
      rank: own.rank,
      points: own.points,
      completedRides: own.completedRides,
      fiveStarRatings: own.fiveStarRatings,
      fourStarRatings: own.fourStarRatings,
      ratingAverage: own.ratingAverage,
      cancellationRateBps: own.cancellationRateBps,
      gapToNextPoints:
        previous == null
          ? 0
          : Math.max(0, previous.points - own.points),
      breakdown: own.breakdown,
      missions: own.missions,
    },
  };
}

export async function driverBenefitsForApp(input: {
  repository: DriverBenefitRepository;
  driverId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const settings = await input.repository.getSettings();
  if (!settings.enabled) {
    return {
      enabled: false,
      campaigns: [],
      history: [],
    };
  }

  const campaigns = await input.repository.listCampaigns();
  const active: ReturnType<typeof driverCampaignView>[] = [];
  const history: {
    id: string;
    name: string;
    category: DriverBenefitCampaignRecord['category'];
    endsAt: string;
    winners: {
      rank: number;
      displayName: string;
      points: number;
      completedRides: number;
      ratingAverage: number;
      isMe: boolean;
    }[];
  }[] = [];

  for (const campaign of campaigns) {
    const effective = effectiveDriverBenefitStatus(campaign, now);
    if (effective !== 'active' && effective !== 'ended') continue;
    if (effective === 'ended' && history.length >= 6) continue;

    const stats = await input.repository.rankingStats(campaign);
    const view = driverCampaignView(
      campaign,
      stats,
      input.driverId,
      now,
    );
    if (view == null) continue;

    if (effective === 'active') {
      active.push(view);
    } else {
      history.push({
        id: view.id,
        name: view.name,
        category: view.category,
        endsAt: view.endsAt,
        winners: view.leaderboard
          .filter((entry) => entry.rank <= 3)
          .slice(0, 3),
      });
    }
  }

  return {
    enabled: true,
    campaigns: active,
    history,
  };
}

export function normalizeBenefitPrizes(
  prizes: DriverBenefitPrize[],
): DriverBenefitPrize[] {
  return [...prizes].sort((a, b) => a.rank - b.rank);
}
