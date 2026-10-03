import type { Pool, PoolClient } from 'pg';

import {
  PromotionRepositoryError,
  prepareRidePromotionRemoval,
  preparePaidPromotionReservation,
  type PassengerPromotionPreferenceRecord,
  type PromotionCampaignRecord,
  type PromotionRedemptionRecord,
  type PromotionRedemptionStatus,
  type PromotionRepository,
  type ReservePromotionRedemptionInput,
  type RemoveRidePromotionInput,
  type RetainPaidPromotionInput,
} from '../promotion-repository.js';
import type { RideRecord } from '../../rides/ride.js';
import { PostgresRideRepository } from '../../rides/repositories/postgres-ride-repository.js';

interface CampaignRow {
  id: string;
  code: string;
  name: string;
  kind: PromotionCampaignRecord['kind'];
  value_cents: number | null;
  percent_bps: number | null;
  max_discount_cents: number | null;
  fixed_driver_fare_cents: number | null;
  fixed_driver_fares_by_category: PromotionCampaignRecord['fixedDriverFaresByCategory'] | null;
  categories: PromotionCampaignRecord['categories'];
  max_redemptions: number;
  per_passenger_limit: number;
  per_device_limit: number;
  starts_at: Date | null;
  ends_at: Date | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface PreferenceRow {
  passenger_id: string;
  campaign_id: string;
  device_hash: string;
  updated_at: Date;
}

interface RedemptionRow {
  id: string;
  campaign_id: string;
  passenger_id: string;
  device_hash: string;
  ride_id: string | null;
  reference_key: string;
  status: PromotionRedemptionStatus;
  normal_total_cents: number;
  discount_cents: number;
  passenger_payable_cents: number;
  driver_earnings_cents: number;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const CAMPAIGN_COLUMNS = `
  id, code, name, kind, value_cents, percent_bps,
  max_discount_cents, fixed_driver_fare_cents, fixed_driver_fares_by_category, categories,
  max_redemptions, per_passenger_limit, per_device_limit,
  starts_at, ends_at, enabled, created_at, updated_at
`;

const REDEMPTION_COLUMNS = `
  id, campaign_id, passenger_id, device_hash, ride_id,
  reference_key, status, normal_total_cents, discount_cents,
  passenger_payable_cents, driver_earnings_cents, expires_at,
  created_at, updated_at
`;

function mapCampaign(row: CampaignRow): PromotionCampaignRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    ...(row.value_cents == null ? {} : { valueCents: row.value_cents }),
    ...(row.percent_bps == null ? {} : { percentBps: row.percent_bps }),
    ...(row.max_discount_cents == null
      ? {}
      : { maxDiscountCents: row.max_discount_cents }),
    ...(row.fixed_driver_fare_cents == null
      ? {}
      : { fixedDriverFareCents: row.fixed_driver_fare_cents }),
    ...(row.fixed_driver_fares_by_category == null ? {} : { fixedDriverFaresByCategory: row.fixed_driver_fares_by_category }),
    categories: row.categories ?? [],
    maxRedemptions: row.max_redemptions,
    perPassengerLimit: row.per_passenger_limit,
    perDeviceLimit: row.per_device_limit,
    ...(row.starts_at == null
      ? {}
      : { startsAt: row.starts_at.toISOString() }),
    ...(row.ends_at == null
      ? {}
      : { endsAt: row.ends_at.toISOString() }),
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapPreference(
  row: PreferenceRow,
): PassengerPromotionPreferenceRecord {
  return {
    passengerId: row.passenger_id,
    campaignId: row.campaign_id,
    deviceHash: row.device_hash,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRedemption(
  row: RedemptionRow,
): PromotionRedemptionRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    passengerId: row.passenger_id,
    deviceHash: row.device_hash,
    ...(row.ride_id == null ? {} : { rideId: row.ride_id }),
    referenceKey: row.reference_key,
    status: row.status,
    normalTotalCents: row.normal_total_cents,
    discountCents: row.discount_cents,
    passengerPayableCents: row.passenger_payable_cents,
    driverEarningsCents: row.driver_earnings_cents,
    ...(row.expires_at == null
      ? {}
      : { expiresAt: row.expires_at.toISOString() }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function countActive(
  client: PoolClient,
  input: {
    campaignId: string;
    now: string;
    passengerId?: string;
    deviceHash?: string;
  },
): Promise<number> {
  const clauses = [
    'campaign_id = $1',
    "(status = 'redeemed' OR (status = 'reserved' AND (expires_at IS NULL OR expires_at > $2::timestamptz)))",
  ];
  const values: unknown[] = [input.campaignId, input.now];
  if (input.passengerId != null) {
    values.push(input.passengerId);
    clauses.push(`passenger_id = $${values.length}`);
  }
  if (input.deviceHash != null) {
    values.push(input.deviceHash);
    clauses.push(`device_hash = $${values.length}`);
  }
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM promotion_redemptions
     WHERE ${clauses.join(' AND ')}`,
    values,
  );
  return Number(result.rows[0]?.count ?? '0');
}

export class PostgresPromotionRepository implements PromotionRepository {
  constructor(private readonly pool: Pool) {}

  async listCampaigns(): Promise<PromotionCampaignRecord[]> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM promotion_campaigns
       ORDER BY updated_at DESC, code ASC`,
    );
    return result.rows.map(mapCampaign);
  }

  async findCampaignById(
    id: string,
  ): Promise<PromotionCampaignRecord | null> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM promotion_campaigns WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapCampaign(result.rows[0]);
  }

  async findCampaignByCode(
    code: string,
  ): Promise<PromotionCampaignRecord | null> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM promotion_campaigns WHERE code = $1 LIMIT 1`,
      [code],
    );
    return result.rows[0] == null ? null : mapCampaign(result.rows[0]);
  }

  async createCampaign(
    record: PromotionCampaignRecord,
  ): Promise<PromotionCampaignRecord> {
    try {
      const result = await this.pool.query<CampaignRow>(
        `
        INSERT INTO promotion_campaigns (
          id, code, name, kind, value_cents, percent_bps,
          max_discount_cents, fixed_driver_fare_cents, categories,
          max_redemptions, per_passenger_limit, per_device_limit,
          starts_at, ends_at, enabled, created_at, updated_at, fixed_driver_fares_by_category
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
        )
        RETURNING ${CAMPAIGN_COLUMNS}
        `,
        [
          record.id,
          record.code,
          record.name,
          record.kind,
          record.valueCents ?? null,
          record.percentBps ?? null,
          record.maxDiscountCents ?? null,
          record.fixedDriverFareCents ?? null,
          record.categories,
          record.maxRedemptions,
          record.perPassengerLimit,
          record.perDeviceLimit,
          record.startsAt ?? null,
          record.endsAt ?? null,
          record.enabled,
          record.createdAt,
          record.updatedAt,
          record.fixedDriverFaresByCategory == null ? null : JSON.stringify(record.fixedDriverFaresByCategory),
        ],
      );
      return mapCampaign(result.rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new PromotionRepositoryError(
          'PROMOTION_REFERENCE_CONFLICT',
          'Código promocional já existe.',
        );
      }
      throw error;
    }
  }

  async setCampaignEnabled(
    id: string,
    enabled: boolean,
    updatedAt: string,
  ): Promise<PromotionCampaignRecord> {
    const result = await this.pool.query<CampaignRow>(
      `UPDATE promotion_campaigns
       SET enabled = $2, updated_at = $3
       WHERE id = $1
       RETURNING ${CAMPAIGN_COLUMNS}`,
      [id, enabled, updatedAt],
    );
    if (result.rows[0] == null) {
      throw new PromotionRepositoryError(
        'PROMOTION_NOT_FOUND',
        'Campanha não encontrada.',
      );
    }
    return mapCampaign(result.rows[0]);
  }

  async getPreference(
    passengerId: string,
  ): Promise<PassengerPromotionPreferenceRecord | null> {
    const result = await this.pool.query<PreferenceRow>(
      `SELECT passenger_id, campaign_id, device_hash, updated_at
       FROM passenger_promotion_preferences
       WHERE passenger_id = $1 LIMIT 1`,
      [passengerId],
    );
    return result.rows[0] == null ? null : mapPreference(result.rows[0]);
  }

  async savePreference(
    preference: PassengerPromotionPreferenceRecord,
  ): Promise<PassengerPromotionPreferenceRecord> {
    const result = await this.pool.query<PreferenceRow>(
      `
      INSERT INTO passenger_promotion_preferences (
        passenger_id, campaign_id, device_hash, updated_at
      ) VALUES ($1,$2,$3,$4)
      ON CONFLICT (passenger_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        device_hash = EXCLUDED.device_hash,
        updated_at = EXCLUDED.updated_at
      RETURNING passenger_id, campaign_id, device_hash, updated_at
      `,
      [
        preference.passengerId,
        preference.campaignId,
        preference.deviceHash,
        preference.updatedAt,
      ],
    );
    return mapPreference(result.rows[0]!);
  }

  async clearPreference(passengerId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM passenger_promotion_preferences WHERE passenger_id = $1',
      [passengerId],
    );
  }

  async findRedemptionById(
    id: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const result = await this.pool.query<RedemptionRow>(
      `SELECT ${REDEMPTION_COLUMNS}
       FROM promotion_redemptions WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapRedemption(result.rows[0]);
  }

  async findRedemptionByRideId(
    rideId: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const result = await this.pool.query<RedemptionRow>(
      `SELECT ${REDEMPTION_COLUMNS}
       FROM promotion_redemptions
       WHERE ride_id = $1
       ORDER BY
         CASE WHEN status <> 'released' THEN 0 ELSE 1 END,
         updated_at DESC,
         created_at DESC
       LIMIT 1`,
      [rideId],
    );
    return result.rows[0] == null ? null : mapRedemption(result.rows[0]);
  }

  async findRedemptionByReferenceKey(
    referenceKey: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const result = await this.pool.query<RedemptionRow>(
      `SELECT ${REDEMPTION_COLUMNS}
       FROM promotion_redemptions WHERE reference_key = $1 LIMIT 1`,
      [referenceKey],
    );
    return result.rows[0] == null ? null : mapRedemption(result.rows[0]);
  }

  async reserveRedemption(
    input: ReservePromotionRedemptionInput,
  ): Promise<PromotionRedemptionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let replacement: PromotionRedemptionRecord | null = null;
      if (input.replaceRedemptionId != null) {
        const replacementResult = await client.query<RedemptionRow>(
          `SELECT ${REDEMPTION_COLUMNS}
           FROM promotion_redemptions
           WHERE id = $1
           FOR UPDATE`,
          [input.replaceRedemptionId],
        );
        const replacementRow = replacementResult.rows[0];
        replacement =
          replacementRow == null ? null : mapRedemption(replacementRow);
        if (
          replacement == null ||
          replacement.status !== 'reserved' ||
          replacement.rideId !== input.redemption.rideId ||
          replacement.passengerId !== input.redemption.passengerId
        ) {
          throw new PromotionRepositoryError(
            'PROMOTION_REFERENCE_CONFLICT',
            'A reserva anterior da corrida não pode ser substituída.',
          );
        }
      }

      const campaignIds = [
        ...new Set([
          input.redemption.campaignId,
          ...(replacement == null ? [] : [replacement.campaignId]),
        ]),
      ].sort();
      const campaigns = await client.query<{ id: string }>(
        `SELECT id
         FROM promotion_campaigns
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [campaignIds],
      );
      if (
        !campaigns.rows.some(
          (item) => item.id === input.redemption.campaignId,
        )
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_NOT_FOUND',
          'Campanha não encontrada.',
        );
      }

      const existing = await client.query<RedemptionRow>(
        `SELECT ${REDEMPTION_COLUMNS}
         FROM promotion_redemptions
         WHERE reference_key = $1 LIMIT 1`,
        [input.redemption.referenceKey],
      );
      if (existing.rows[0] != null) {
        const item = mapRedemption(existing.rows[0]);
        if (
          item.campaignId !== input.redemption.campaignId ||
          item.passengerId !== input.redemption.passengerId ||
          item.deviceHash !== input.redemption.deviceHash
        ) {
          throw new PromotionRepositoryError(
            'PROMOTION_REFERENCE_CONFLICT',
            'Reserva promocional já pertence a outro uso.',
          );
        }
        await client.query('COMMIT');
        return item;
      }

      if (replacement != null) {
        await client.query(
          `UPDATE promotion_redemptions
           SET status = 'released', updated_at = $2
           WHERE id = $1`,
          [replacement.id, input.now],
        );
      }

      if (
        (await countActive(client, {
          campaignId: input.redemption.campaignId,
          now: input.now,
        })) >= input.maxRedemptions
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_LIMIT_REACHED',
          'O limite total deste cupom foi atingido.',
        );
      }
      if (
        (await countActive(client, {
          campaignId: input.redemption.campaignId,
          now: input.now,
          passengerId: input.redemption.passengerId,
        })) >= input.perPassengerLimit
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_PASSENGER_LIMIT_REACHED',
          'Este passageiro já atingiu o limite deste cupom.',
        );
      }
      if (
        (await countActive(client, {
          campaignId: input.redemption.campaignId,
          now: input.now,
          deviceHash: input.redemption.deviceHash,
        })) >= input.perDeviceLimit
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_DEVICE_LIMIT_REACHED',
          'Este aparelho já atingiu o limite deste cupom.',
        );
      }

      const r = input.redemption;
      const inserted = await client.query<RedemptionRow>(
        `
        INSERT INTO promotion_redemptions (
          id, campaign_id, passenger_id, device_hash, ride_id,
          reference_key, status, normal_total_cents, discount_cents,
          passenger_payable_cents, driver_earnings_cents, expires_at,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
        )
        RETURNING ${REDEMPTION_COLUMNS}
        `,
        [
          r.id,
          r.campaignId,
          r.passengerId,
          r.deviceHash,
          r.rideId ?? null,
          r.referenceKey,
          r.status,
          r.normalTotalCents,
          r.discountCents,
          r.passengerPayableCents,
          r.driverEarningsCents,
          r.expiresAt ?? null,
          r.createdAt,
          r.updatedAt,
        ],
      );
      await client.query('COMMIT');
      return mapRedemption(inserted.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeFromRide(input: RemoveRidePromotionInput): Promise<RideRecord> {
    if (!(input.rides instanceof PostgresRideRepository) ||
        !input.rides.usesConnection(this.pool)) {
      throw new Error('Promotion removal requires repositories sharing the same pool.');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM rides WHERE id = $1 FOR UPDATE',
        [input.expectedRide.id]);
      const rides = new PostgresRideRepository(client);
      const current = await rides.findById(input.expectedRide.id);
      let redemption: PromotionRedemptionRecord | null = null;
      if (current?.promotion != null) {
        const result = await client.query<RedemptionRow>(
          `SELECT ${REDEMPTION_COLUMNS} FROM promotion_redemptions
           WHERE id = $1 FOR UPDATE`,
          [current.promotion.applicationId],
        );
        redemption = result.rows[0] == null ? null : mapRedemption(result.rows[0]);
      }
      const restored = prepareRidePromotionRemoval(current, input, redemption);
      if (current?.promotion == null) {
        await client.query('COMMIT');
        return restored;
      }
      const saved = await rides.save(restored);
      await client.query(
        `UPDATE promotion_redemptions SET status = 'released', updated_at = $2
         WHERE id = $1`,
        [redemption!.id, input.updatedAt],
      );
      await client.query('COMMIT');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async retainPaidReservation(input: RetainPaidPromotionInput): Promise<PromotionRedemptionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<RedemptionRow>(
        `SELECT ${REDEMPTION_COLUMNS} FROM promotion_redemptions
         WHERE id = $1 FOR UPDATE`, [input.redemptionId],
      );
      const current = result.rows[0] == null ? null : mapRedemption(result.rows[0]);
      const retained = preparePaidPromotionReservation(current, input);
      // Serialize with reserveRedemption's campaign lock before changing limit eligibility.
      await client.query('SELECT id FROM promotion_campaigns WHERE id = $1 FOR UPDATE',
        [input.campaignId]);
      if (current?.expiresAt != null && current.status === 'reserved') {
        await client.query(
          `UPDATE promotion_redemptions SET expires_at = NULL, updated_at = $2 WHERE id = $1`,
          [input.redemptionId, input.updatedAt],
        );
      }
      await client.query('COMMIT');
      return retained;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setRedemptionStatus(
    id: string,
    status: PromotionRedemptionStatus,
    updatedAt: string,
  ): Promise<PromotionRedemptionRecord> {
    const result = await this.pool.query<RedemptionRow>(
      `UPDATE promotion_redemptions
       SET status = $2, updated_at = $3
       WHERE id = $1
       RETURNING ${REDEMPTION_COLUMNS}`,
      [id, status, updatedAt],
    );
    if (result.rows[0] == null) {
      throw new PromotionRepositoryError(
        'PROMOTION_NOT_FOUND',
        'Uso promocional não encontrado.',
      );
    }
    return mapRedemption(result.rows[0]);
  }

  async extendReservedExpiry(id: string, expiresAt: string, at: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE promotion_redemptions SET expires_at = $2, updated_at = $3
       WHERE id = $1 AND status = 'reserved' AND (expires_at IS NULL OR expires_at > $3)`, [id, expiresAt, at]);
    if (result.rowCount !== 1) throw new PromotionRepositoryError('PROMOTION_REFERENCE_CONFLICT', 'A reserva do cupom expirou. Peça uma nova corrida.');
  }

  async countRedeemed(campaignId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM promotion_redemptions
       WHERE campaign_id = $1 AND status = 'redeemed'`,
      [campaignId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }
}
