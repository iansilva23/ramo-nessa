import type { Pool } from 'pg';

import type {
  DriverBenefitBaseRecord,
  DriverBenefitCampaignRecord,
  DriverBenefitCampaignStatus,
  DriverBenefitCategory,
  DriverBenefitMission,
  DriverBenefitParticipantMode,
  DriverBenefitPrize,
  DriverBenefitRegion,
  DriverBenefitRegionMode,
  DriverBenefitRepository,
  DriverBenefitSettingsRecord,
  DriverBenefitStatsRecord,
} from '../driver-benefit-repository.js';

interface SettingsRow {
  enabled: boolean;
  updated_at: Date;
}

interface CampaignRow {
  id: string;
  name: string;
  category: DriverBenefitCategory;
  region_mode: DriverBenefitRegionMode;
  participant_mode: DriverBenefitParticipantMode;
  regions: DriverBenefitRegion[];
  participant_driver_ids: string[];
  excluded_driver_ids: string[];
  status: DriverBenefitCampaignStatus;
  starts_at: Date;
  ends_at: Date;
  top_count: number;
  min_participants: number;
  ride_points: number;
  five_star_points: number;
  four_star_points: number;
  low_cancellation_max_bps: number;
  low_cancellation_bonus_points: number;
  missions: DriverBenefitMission[];
  prizes: DriverBenefitPrize[];
  created_at: Date;
  updated_at: Date;
}

interface BaseRow {
  driver_id: string;
  zone_id: string;
  locality_id: string | null;
  updated_at: Date;
}

interface EligibleDriverRow {
  driver_id: string;
  display_name: string;
  zone_id: string | null;
  locality_id: string | null;
}

interface RideAggregateRow {
  driver_id: string;
  state: 'COMPLETED' | 'CANCELLED_BY_DRIVER';
  origin_zone_id: string;
  origin_locality_id: string | null;
  destination_zone_id: string;
  destination_locality_id: string | null;
  count: number;
}

interface RatingAggregateRow {
  driver_id: string;
  stars: number;
  origin_zone_id: string;
  origin_locality_id: string | null;
  destination_zone_id: string;
  destination_locality_id: string | null;
  count: number;
}

const CAMPAIGN_COLUMNS = `
  id, name, category, region_mode, participant_mode, regions,
  participant_driver_ids, excluded_driver_ids, status, starts_at, ends_at,
  top_count, min_participants, ride_points, five_star_points,
  four_star_points, low_cancellation_max_bps,
  low_cancellation_bonus_points, missions, prizes, created_at, updated_at
`;

function mapSettings(row: SettingsRow): DriverBenefitSettingsRecord {
  return {
    enabled: row.enabled,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCampaign(row: CampaignRow): DriverBenefitCampaignRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    regionMode: row.region_mode,
    participantMode: row.participant_mode,
    regions: row.regions ?? [],
    participantDriverIds: row.participant_driver_ids ?? [],
    excludedDriverIds: row.excluded_driver_ids ?? [],
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    topCount: row.top_count,
    minParticipants: row.min_participants,
    ridePoints: row.ride_points,
    fiveStarPoints: row.five_star_points,
    fourStarPoints: row.four_star_points,
    lowCancellationMaxBps: row.low_cancellation_max_bps,
    lowCancellationBonusPoints: row.low_cancellation_bonus_points,
    missions: row.missions ?? [],
    prizes: row.prizes ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBase(row: BaseRow): DriverBenefitBaseRecord {
  return {
    driverId: row.driver_id,
    zoneId: row.zone_id,
    ...(row.locality_id == null
      ? {}
      : { localityId: row.locality_id }),
    updatedAt: row.updated_at.toISOString(),
  };
}

function regionMatches(
  regions: DriverBenefitRegion[],
  zoneId: string,
  localityId: string | null,
): boolean {
  if (regions.length === 0) return true;
  return regions.some(
    (region) =>
      region.zoneId === zoneId &&
      (region.localityId == null ||
        region.localityId === localityId),
  );
}

function rideMatches(
  campaign: DriverBenefitCampaignRecord,
  row: Pick<
    RideAggregateRow,
    | 'origin_zone_id'
    | 'origin_locality_id'
    | 'destination_zone_id'
    | 'destination_locality_id'
  >,
): boolean {
  if (campaign.regionMode === 'driver_base') return true;
  return (
    regionMatches(
      campaign.regions,
      row.origin_zone_id,
      row.origin_locality_id,
    ) ||
    regionMatches(
      campaign.regions,
      row.destination_zone_id,
      row.destination_locality_id,
    )
  );
}

function baseMatches(
  campaign: DriverBenefitCampaignRecord,
  row: EligibleDriverRow,
): boolean {
  if (campaign.regionMode === 'ride') return true;
  if (campaign.regions.length === 0) return true;
  if (row.zone_id == null) return false;
  return regionMatches(
    campaign.regions,
    row.zone_id,
    row.locality_id,
  );
}

export class PostgresDriverBenefitRepository
  implements DriverBenefitRepository
{
  constructor(private readonly pool: Pool) {}

  async getSettings(): Promise<DriverBenefitSettingsRecord> {
    const result = await this.pool.query<SettingsRow>(
      `SELECT enabled, updated_at
       FROM driver_benefit_settings
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de Ranking & Benefícios não inicializada.');
    }
    return mapSettings(row);
  }

  async updateSettings(input: {
    enabled: boolean;
    updatedAt: string;
  }): Promise<DriverBenefitSettingsRecord> {
    const result = await this.pool.query<SettingsRow>(
      `UPDATE driver_benefit_settings
       SET enabled = $1, updated_at = $2
       WHERE id = 1
       RETURNING enabled, updated_at`,
      [input.enabled, input.updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de Ranking & Benefícios não encontrada.');
    }
    return mapSettings(row);
  }

  async listCampaigns(): Promise<DriverBenefitCampaignRecord[]> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM driver_benefit_campaigns
       ORDER BY updated_at DESC, created_at DESC`,
    );
    return result.rows.map(mapCampaign);
  }

  async findCampaign(
    id: string,
  ): Promise<DriverBenefitCampaignRecord | null> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM driver_benefit_campaigns
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row == null ? null : mapCampaign(row);
  }

  async createCampaign(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitCampaignRecord> {
    const result = await this.pool.query<CampaignRow>(
      `INSERT INTO driver_benefit_campaigns (
        id, name, category, region_mode, participant_mode, regions,
        participant_driver_ids, excluded_driver_ids, status, starts_at,
        ends_at, top_count, min_participants, ride_points,
        five_star_points, four_star_points, low_cancellation_max_bps,
        low_cancellation_bonus_points, missions, prizes, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19::jsonb,$20::jsonb,$21,$22
      )
      RETURNING ${CAMPAIGN_COLUMNS}`,
      [
        campaign.id,
        campaign.name,
        campaign.category,
        campaign.regionMode,
        campaign.participantMode,
        JSON.stringify(campaign.regions),
        campaign.participantDriverIds,
        campaign.excludedDriverIds,
        campaign.status,
        campaign.startsAt,
        campaign.endsAt,
        campaign.topCount,
        campaign.minParticipants,
        campaign.ridePoints,
        campaign.fiveStarPoints,
        campaign.fourStarPoints,
        campaign.lowCancellationMaxBps,
        campaign.lowCancellationBonusPoints,
        JSON.stringify(campaign.missions),
        JSON.stringify(campaign.prizes),
        campaign.createdAt,
        campaign.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Campanha não foi persistida.');
    return mapCampaign(row);
  }

  async updateCampaign(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitCampaignRecord> {
    const result = await this.pool.query<CampaignRow>(
      `UPDATE driver_benefit_campaigns
       SET name = $2,
           category = $3,
           region_mode = $4,
           participant_mode = $5,
           regions = $6::jsonb,
           participant_driver_ids = $7,
           excluded_driver_ids = $8,
           status = $9,
           starts_at = $10,
           ends_at = $11,
           top_count = $12,
           min_participants = $13,
           ride_points = $14,
           five_star_points = $15,
           four_star_points = $16,
           low_cancellation_max_bps = $17,
           low_cancellation_bonus_points = $18,
           missions = $19::jsonb,
           prizes = $20::jsonb,
           updated_at = $21
       WHERE id = $1
       RETURNING ${CAMPAIGN_COLUMNS}`,
      [
        campaign.id,
        campaign.name,
        campaign.category,
        campaign.regionMode,
        campaign.participantMode,
        JSON.stringify(campaign.regions),
        campaign.participantDriverIds,
        campaign.excludedDriverIds,
        campaign.status,
        campaign.startsAt,
        campaign.endsAt,
        campaign.topCount,
        campaign.minParticipants,
        campaign.ridePoints,
        campaign.fiveStarPoints,
        campaign.fourStarPoints,
        campaign.lowCancellationMaxBps,
        campaign.lowCancellationBonusPoints,
        JSON.stringify(campaign.missions),
        JSON.stringify(campaign.prizes),
        campaign.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Campanha não encontrada.');
    return mapCampaign(row);
  }

  async findDriverBase(
    driverId: string,
  ): Promise<DriverBenefitBaseRecord | null> {
    const result = await this.pool.query<BaseRow>(
      `SELECT driver_id, zone_id, locality_id, updated_at
       FROM driver_benefit_driver_bases
       WHERE driver_id = $1
       LIMIT 1`,
      [driverId],
    );
    const row = result.rows[0];
    return row == null ? null : mapBase(row);
  }

  async setDriverBase(
    base: DriverBenefitBaseRecord,
  ): Promise<DriverBenefitBaseRecord> {
    const result = await this.pool.query<BaseRow>(
      `INSERT INTO driver_benefit_driver_bases (
         driver_id, zone_id, locality_id, updated_at
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (driver_id)
       DO UPDATE SET
         zone_id = EXCLUDED.zone_id,
         locality_id = EXCLUDED.locality_id,
         updated_at = EXCLUDED.updated_at
       RETURNING driver_id, zone_id, locality_id, updated_at`,
      [
        base.driverId,
        base.zoneId,
        base.localityId ?? null,
        base.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Base do motorista não foi persistida.');
    return mapBase(row);
  }

  async clearDriverBase(driverId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM driver_benefit_driver_bases WHERE driver_id = $1',
      [driverId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async rankingStats(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitStatsRecord[]> {
    const eligible = await this.pool.query<EligibleDriverRow>(
      `SELECT
         p.driver_id,
         COALESCE(NULLIF(p.preferred_name, ''), p.full_name) AS display_name,
         b.zone_id,
         b.locality_id
       FROM driver_profiles p
       JOIN driver_vehicles v ON v.driver_id = p.driver_id
       LEFT JOIN driver_benefit_driver_bases b
         ON b.driver_id = p.driver_id
       WHERE p.status = 'approved'
         AND v.status = 'approved'
         AND $1 = ANY(v.categories)`,
      [campaign.category],
    );

    const selected = new Set(campaign.participantDriverIds);
    const excluded = new Set(campaign.excludedDriverIds);
    const drivers = eligible.rows.filter((row) => {
      if (excluded.has(row.driver_id)) return false;
      if (
        campaign.participantMode === 'selected' &&
        !selected.has(row.driver_id)
      ) {
        return false;
      }
      return baseMatches(campaign, row);
    });

    const driverIds = drivers.map((driver) => driver.driver_id);
    if (driverIds.length === 0) return [];

    const [rides, ratings] = await Promise.all([
      this.pool.query<RideAggregateRow>(
        `SELECT
           driver_id,
           state,
           origin_zone_id,
           origin_locality_id,
           destination_zone_id,
           destination_locality_id,
           COUNT(*)::int AS count
         FROM rides
         WHERE driver_id = ANY($1::text[])
           AND category = $2
           AND updated_at >= $3
           AND updated_at < $4
           AND state IN ('COMPLETED', 'CANCELLED_BY_DRIVER')
         GROUP BY
           driver_id, state, origin_zone_id, origin_locality_id,
           destination_zone_id, destination_locality_id`,
        [driverIds, campaign.category, campaign.startsAt, campaign.endsAt],
      ),
      this.pool.query<RatingAggregateRow>(
        `SELECT
           r.driver_id,
           dr.stars,
           r.origin_zone_id,
           r.origin_locality_id,
           r.destination_zone_id,
           r.destination_locality_id,
           COUNT(*)::int AS count
         FROM driver_ratings dr
         JOIN rides r ON r.id = dr.ride_id
         WHERE r.driver_id = ANY($1::text[])
           AND r.category = $2
           AND r.state = 'COMPLETED'
           AND r.updated_at >= $3
           AND r.updated_at < $4
         GROUP BY
           r.driver_id, dr.stars, r.origin_zone_id, r.origin_locality_id,
           r.destination_zone_id, r.destination_locality_id`,
        [driverIds, campaign.category, campaign.startsAt, campaign.endsAt],
      ),
    ]);

    const stats = new Map<string, DriverBenefitStatsRecord>();
    for (const driver of drivers) {
      stats.set(driver.driver_id, {
        driverId: driver.driver_id,
        displayName: driver.display_name,
        ...(driver.zone_id == null
          ? {}
          : { baseZoneId: driver.zone_id }),
        ...(driver.locality_id == null
          ? {}
          : { baseLocalityId: driver.locality_id }),
        completedRides: 0,
        cancelledByDriver: 0,
        fiveStarRatings: 0,
        fourStarRatings: 0,
        ratingSum: 0,
        ratingCount: 0,
      });
    }

    for (const row of rides.rows) {
      if (!rideMatches(campaign, row)) continue;
      const current = stats.get(row.driver_id);
      if (current == null) continue;
      if (row.state === 'COMPLETED') {
        current.completedRides += row.count;
      } else {
        current.cancelledByDriver += row.count;
      }
    }

    for (const row of ratings.rows) {
      if (!rideMatches(campaign, row)) continue;
      const current = stats.get(row.driver_id);
      if (current == null) continue;
      current.ratingCount += row.count;
      current.ratingSum += row.stars * row.count;
      if (row.stars === 5) current.fiveStarRatings += row.count;
      if (row.stars === 4) current.fourStarRatings += row.count;
    }

    return [...stats.values()];
  }
}
