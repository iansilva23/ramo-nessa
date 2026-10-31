import type { Pool, PoolClient } from 'pg';

import type { RideRecord } from '../ride.js';
import {RECOVERABLE_RIDE_STATES} from '../ride-resumption.js';
import type {
  AdminRideListInput,
  AdminRideListPage,
  AdminPassengerRideSummary,
  AdminRideOperationalSummary,
  DriverRideSummary,
  RideChatMessageRecord,
  RideChatSenderType,
  RideRepository,
  PassengerRatingRecord,
} from '../ride-repository.js';

interface RideChatMessageRow {
  id: string;
  ride_id: string;
  sender_type: 'passenger' | 'driver';
  sender_id: string;
  body: string;
  created_at: Date;
}

interface RideRow {
  id: string;
  passenger_id: string;
  state: RideRecord['state'];
  payment_status: RideRecord['paymentStatus'];
  manual_refund?: boolean;
  cancellation_state?: string | null;
  occurrence_terms?: RideRecord['occurrenceTerms'];
  occurrence_bonus?: RideRecord['occurrenceBonus'] | null;
  payment_method: RideRecord['paymentMethod'] | null;
  driver_id: string | null;
  driver_consent_required: boolean;
  reserved_driver_id: string | null;
  driver_hold_expires_at: Date | null;
  payment_expires_at: Date | null;
  driver_search_max_distance_km: string | null;
  pickup_label: string | null;
  dropoff_label: string | null;
  pickup_instructions: string | null;
  dropoff_instructions: string | null;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  dropoff_latitude: string | null;
  dropoff_longitude: string | null;
  origin_zone_id: RideRecord['origin']['zoneId'];
  origin_locality_id: string | null;
  destination_zone_id: RideRecord['destination']['zoneId'];
  destination_locality_id: string | null;
  category: RideRecord['category'];
  requires_four_by_four: boolean;
  price_period: RideRecord['period'];
  passengers: number;
  trip_distance_km: string | null;
  driver_pickup_distance_km: string | null;
  pricing_rule_id: string;
  pricing_catalog_label: string;
  pricing_catalog_version_id: string | null;
  pricing_catalog_version_number: string | number | null;
  base_amount_cents: number;
  pickup_compensation_cents: number;
  total_amount_cents: number;
  platform_commission_cents: number;
  driver_net_cents: number;
  promotion_snapshot: RideRecord['promotion'] | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RideRow): RideRecord {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    ...(row.driver_search_max_distance_km == null ? {} : { driverSearchMaxDistanceKm: Number(row.driver_search_max_distance_km) }),
    state: row.state,
    ...(row.occurrence_terms ? {occurrenceTerms:row.occurrence_terms} : {}),
    ...(row.occurrence_bonus == null ? {} : {occurrenceBonus: row.occurrence_bonus}),
    ...(row.cancellation_state == null ? {} : { cancellationState: row.cancellation_state }),
    paymentStatus: row.payment_status,
    ...(row.manual_refund ? { manualRefund: true } : {}),
    ...(row.driver_consent_required ? { driverConsentRequired: true } : {}),
    ...(row.payment_method != null
      ? { paymentMethod: row.payment_method }
      : {}),
    ...(row.driver_id != null ? { driverId: row.driver_id } : {}),
    ...(row.reserved_driver_id != null
      ? { reservedDriverId: row.reserved_driver_id }
      : {}),
    ...(row.driver_hold_expires_at != null
      ? { driverHoldExpiresAt: row.driver_hold_expires_at.toISOString() }
      : {}),
    ...(row.payment_expires_at == null ? {} : { paymentExpiresAt: row.payment_expires_at.toISOString() }),
    ...(row.pickup_label == null ? {} : { pickupLabel: row.pickup_label }),
    ...(row.dropoff_label == null ? {} : { dropoffLabel: row.dropoff_label }),
    ...(row.pickup_instructions == null ? {} : { pickupInstructions: row.pickup_instructions }),
    ...(row.dropoff_instructions == null ? {} : { dropoffInstructions: row.dropoff_instructions }),
    ...(row.pickup_latitude != null
      ? { pickupLatitude: Number(row.pickup_latitude) }
      : {}),
    ...(row.pickup_longitude != null
      ? { pickupLongitude: Number(row.pickup_longitude) }
      : {}),
    ...(row.dropoff_latitude != null
      ? { dropoffLatitude: Number(row.dropoff_latitude) }
      : {}),
    ...(row.dropoff_longitude != null
      ? { dropoffLongitude: Number(row.dropoff_longitude) }
      : {}),
    origin: {
      zoneId: row.origin_zone_id,
      ...(row.origin_locality_id != null
        ? { localityId: row.origin_locality_id }
        : {}),
    },
    destination: {
      zoneId: row.destination_zone_id,
      ...(row.destination_locality_id != null
        ? { localityId: row.destination_locality_id }
        : {}),
    },
    category: row.category,
    requiresFourByFour: row.requires_four_by_four,
    period: row.price_period,
    passengers: row.passengers,
    ...(row.trip_distance_km != null
      ? { tripDistanceKm: Number(row.trip_distance_km) }
      : {}),
    ...(row.driver_pickup_distance_km != null
      ? { driverPickupDistanceKm: Number(row.driver_pickup_distance_km) }
      : {}),
    quote: {
      ruleId: row.pricing_rule_id,
      catalogVersion: row.pricing_catalog_label,
      ...(row.pricing_catalog_version_id != null
        ? { catalogVersionId: row.pricing_catalog_version_id }
        : {}),
      ...(row.pricing_catalog_version_number != null
        ? {
            catalogVersionNumber: Number(
              row.pricing_catalog_version_number,
            ),
          }
        : {}),
      baseAmountCents: row.base_amount_cents,
      pickupCompensationCents: row.pickup_compensation_cents,
      totalAmountCents: row.total_amount_cents,
      platformCommissionCents: row.platform_commission_cents,
      driverNetCents: row.driver_net_cents,
    },
    ...(row.promotion_snapshot == null
      ? {}
      : { promotion: structuredClone(row.promotion_snapshot) }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const RETURNING = `
  id, passenger_id, state, payment_status, payment_method, driver_id, manual_refund, cancellation_state, occurrence_bonus, occurrence_terms,
  driver_consent_required, reserved_driver_id, driver_hold_expires_at, payment_expires_at, driver_search_max_distance_km,
  pickup_label, dropoff_label, pickup_instructions, dropoff_instructions,
  pickup_latitude, pickup_longitude,
  dropoff_latitude, dropoff_longitude,
  origin_zone_id, origin_locality_id,
  destination_zone_id, destination_locality_id,
  category, requires_four_by_four, price_period, passengers,
  trip_distance_km, driver_pickup_distance_km,
  pricing_rule_id, pricing_catalog_label,
  pricing_catalog_version_id, pricing_catalog_version_number,
  base_amount_cents, pickup_compensation_cents,
  total_amount_cents, platform_commission_cents, driver_net_cents,
  promotion_snapshot, created_at, updated_at
`;

export class PostgresRideRepository implements RideRepository {
  async listActivityEvents(rideId: string): Promise<import('../ride-support-context.js').RideActivityEvent[]> {
    const result = await this.pool.query(`SELECT state, payment_status, driver_id, recorded_at, driver_location, vehicle_snapshot
      FROM ride_activity_events WHERE ride_id = $1 ORDER BY id`, [rideId]);
    return result.rows.map(row => ({state: row.state, paymentStatus: row.payment_status,
      driverId: row.driver_id, recordedAt: row.recorded_at.toISOString(), driverLocation: row.driver_location, vehicleSnapshot: row.vehicle_snapshot}));
  }

  async findRecoverableByPassengerId(passengerId:string):Promise<RideRecord|null>{
    const result=await this.pool.query<RideRow>("SELECT * FROM rides WHERE passenger_id=$1 AND state=ANY($2::text[]) ORDER BY CASE WHEN state='IN_PROGRESS' THEN 0 WHEN state IN ('DRIVER_ARRIVED','DRIVER_ASSIGNED','DRIVER_ARRIVING') THEN 1 WHEN state IN ('PAID','SEARCHING_DRIVER','NO_DRIVER_FOUND') THEN 2 ELSE 3 END,updated_at DESC,id DESC LIMIT 1",[passengerId,RECOVERABLE_RIDE_STATES]);
    return result.rows[0]?mapRow(result.rows[0]):null;
  }
  constructor(private readonly pool: Pool | PoolClient) {}

  usesConnection(pool: Pool): boolean {
    return this.pool === pool;
  }

  async findPassengerRating(rideId: string, driverId: string): Promise<PassengerRatingRecord | null> {
    const result = await this.pool.query(`SELECT ride_id AS "rideId", driver_id AS "driverId",
      passenger_id AS "passengerId", stars, reasons, comment, created_at AS "createdAt"
      FROM passenger_ratings WHERE ride_id = $1 AND driver_id = $2`, [rideId, driverId]);
    const row = result.rows[0];
    return row == null ? null : {...row, createdAt: row.createdAt.toISOString()};
  }

  async recordPassengerRating(rating: PassengerRatingRecord): Promise<{rating: PassengerRatingRecord; created: boolean} | null> {
    const result = await this.pool.query(`INSERT INTO passenger_ratings
      (ride_id, driver_id, passenger_id, stars, reasons, comment, created_at)
      SELECT id, driver_id, passenger_id, $4, $5, $6, $7 FROM rides
      WHERE id = $1 AND driver_id = $2 AND passenger_id = $3 AND state = 'COMPLETED'
      ON CONFLICT (ride_id) DO NOTHING RETURNING ride_id`,
      [rating.rideId, rating.driverId, rating.passengerId, rating.stars, rating.reasons, rating.comment, rating.createdAt]);
    const stored = await this.findPassengerRating(rating.rideId, rating.driverId);
    return stored == null ? null : {rating: stored, created: result.rowCount === 1};
  }

  async create(ride: RideRecord): Promise<RideRecord> {
    const result = await this.pool.query<RideRow>(
      `
      INSERT INTO rides (
        id, passenger_id, state, payment_status, payment_method, driver_id,
        reserved_driver_id, driver_hold_expires_at, driver_search_max_distance_km,
        pickup_latitude, pickup_longitude,
        dropoff_latitude, dropoff_longitude,
        origin_zone_id, origin_locality_id,
        destination_zone_id, destination_locality_id,
        category, requires_four_by_four, price_period, passengers,
        trip_distance_km, driver_pickup_distance_km,
        pricing_rule_id, pricing_catalog_label,
        pricing_catalog_version_id, pricing_catalog_version_number,
        base_amount_cents, pickup_compensation_cents,
        total_amount_cents, platform_commission_cents, driver_net_cents,
        promotion_snapshot, created_at, updated_at, driver_consent_required, pickup_instructions, dropoff_instructions, payment_expires_at, pickup_label, dropoff_label
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41
      )
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.passengerId,
        ride.state,
        ride.paymentStatus,
        ride.paymentMethod ?? null,
        ride.driverId ?? null,
        ride.reservedDriverId ?? null,
        ride.driverHoldExpiresAt ?? null,
        ride.driverSearchMaxDistanceKm ?? null,
        ride.pickupLatitude ?? null,
        ride.pickupLongitude ?? null,
        ride.dropoffLatitude ?? null,
        ride.dropoffLongitude ?? null,
        ride.origin.zoneId,
        ride.origin.localityId ?? null,
        ride.destination.zoneId,
        ride.destination.localityId ?? null,
        ride.category,
        ride.requiresFourByFour ?? false,
        ride.period,
        ride.passengers,
        ride.tripDistanceKm ?? null,
        ride.driverPickupDistanceKm ?? null,
        ride.quote.ruleId,
        ride.quote.catalogVersion ?? 'v1',
        ride.quote.catalogVersionId ?? null,
        ride.quote.catalogVersionNumber ?? null,
        ride.quote.baseAmountCents,
        ride.quote.pickupCompensationCents,
        ride.quote.totalAmountCents,
        ride.quote.platformCommissionCents,
        ride.quote.driverNetCents,
        ride.promotion ?? null,
        ride.createdAt,
        ride.updatedAt,
        ride.driverConsentRequired ?? false,
        ride.pickupInstructions ?? null,
        ride.dropoffInstructions ?? null,
        ride.paymentExpiresAt ?? null,
        ride.pickupLabel ?? null,
        ride.dropoffLabel ?? null,
      ],
    );

    const row = result.rows[0];
    if (row == null) throw new Error('PostgreSQL não retornou a corrida criada.');
    return mapRow(row);
  }

  async findById(id: string): Promise<RideRecord | null> {
    const result = await this.pool.query<RideRow>(
      `SELECT ${RETURNING} FROM rides WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async findActiveByDriverId(
    driverId: string,
  ): Promise<RideRecord | null> {
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE driver_id = $1
        AND state IN (
          'INTERRUPTED',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS',
          'COMPLETED'
        )
      ORDER BY (state = 'COMPLETED') ASC, (state = 'IN_PROGRESS') DESC, updated_at DESC, id DESC
      LIMIT 1
      `,
      [driverId],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async listPendingDispatch(before: string, limit: number): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const result = await this.pool.query<RideRow>(
      `SELECT ${RETURNING} FROM rides
       WHERE state IN ('PAID', 'SEARCHING_DRIVER')
         AND payment_status IN ('paid', 'authorized')
         AND COALESCE(driver_consent_required, false) = false
         AND pickup_latitude IS NOT NULL AND pickup_longitude IS NOT NULL
         AND updated_at <= $1::timestamptz
         AND NOT EXISTS (
           SELECT 1 FROM ride_offers
           WHERE ride_id = rides.id AND status = 'OFFERED'
             AND expires_at > $1::timestamptz
         )
       ORDER BY updated_at ASC, id ASC LIMIT $2`,
      [before, safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async listNoDriverFoundBefore(
    before: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE state = 'NO_DRIVER_FOUND'
        AND updated_at <= $1::timestamptz
      ORDER BY updated_at ASC, id ASC
      LIMIT $2
      `,
      [before, safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async listRefundPendingBefore(
    before: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE state = 'REFUND_PENDING'
        AND updated_at <= $1::timestamptz
      ORDER BY updated_at ASC, id ASC
      LIMIT $2
      `,
      [before, safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async listAdminActive(limit: number): Promise<RideRecord[]> {
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE state IN (
        'PAID',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS'
      )
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(mapRow);
  }

  async listAdminRecentByPassengerId(
    passengerId: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE passenger_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT $2
      `,
      [passengerId, safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async getAdminPassengerRideSummary(
    passengerId: string,
  ): Promise<AdminPassengerRideSummary> {
    const result = await this.pool.query<AdminPassengerRideSummary>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE state IN (
            'PAID',
            'SEARCHING_DRIVER',
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'IN_PROGRESS'
          )
        )::int AS active,
        COUNT(*) FILTER (
          WHERE state = 'COMPLETED'
        )::int AS completed,
        COUNT(*) FILTER (
          WHERE state IN (
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'CANCELLED_BY_ADMIN'
          )
        )::int AS cancelled,
        COALESCE(SUM(
          CASE
            WHEN state = 'COMPLETED' THEN total_amount_cents+CASE WHEN payment_method='cash' THEN COALESCE((occurrence_bonus->>'amountCents')::int,0) ELSE 0 END
            ELSE 0
          END
        ), 0)::int AS "completedAmountCents"
      FROM rides
      WHERE passenger_id = $1
      `,
      [passengerId],
    );
    return result.rows[0] ?? {
      total: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      completedAmountCents: 0,
    };
  }

  async listRecentByDriverId(
    driverId: string,
    limit: number,
    from?: string,
    to?: string,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE driver_id = $1
        AND ($2::timestamptz IS NULL OR updated_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR updated_at < $3::timestamptz)
      ORDER BY updated_at DESC, id DESC
      LIMIT $4
      `,
      [driverId, from ?? null, to ?? null, safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async getDriverRideSummary(
    driverId: string,
    from?: string,
    to?: string,
  ): Promise<DriverRideSummary> {
    const result = await this.pool.query<DriverRideSummary>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE state = 'COMPLETED'
        )::int AS completed,
        COUNT(*) FILTER (
          WHERE state IN (
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'CANCELLED_BY_ADMIN'
          )
        )::int AS cancelled,
        COUNT(*) FILTER (
          WHERE state IN (
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'IN_PROGRESS'
          )
        )::int AS "inProgress",
        COALESCE(SUM(
          CASE
            WHEN state = 'COMPLETED' THEN driver_net_cents+CASE WHEN payment_method='cash' THEN COALESCE((occurrence_bonus->>'amountCents')::int,0) ELSE 0 END
            ELSE 0
          END
        ), 0)::int AS "earningsCents",
        COALESCE(SUM(
          CASE
            WHEN state = 'COMPLETED' THEN total_amount_cents+CASE WHEN payment_method='cash' THEN COALESCE((occurrence_bonus->>'amountCents')::int,0) ELSE 0 END
            ELSE 0
          END
        ), 0)::int AS "grossCents",
        COALESCE(SUM(
          CASE
            WHEN state = 'COMPLETED' THEN platform_commission_cents
            ELSE 0
          END
        ), 0)::int AS "platformFeeCents"
      FROM rides
      WHERE driver_id = $1
        AND ($2::timestamptz IS NULL OR updated_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR updated_at < $3::timestamptz)
      `,
      [driverId, from ?? null, to ?? null],
    );

    return result.rows[0] ?? {
      total: 0,
      completed: 0,
      cancelled: 0,
      inProgress: 0,
      earningsCents: 0,
      grossCents: 0,
      platformFeeCents: 0,
    };
  }

  async listAdmin(
    input: AdminRideListInput,
  ): Promise<AdminRideListPage> {
    const result = await this.pool.query<RideRow>(
      `
      SELECT ${RETURNING}
      FROM rides
      WHERE
        (
          $1::text[] IS NULL
          OR state = ANY($1::text[])
        )
        AND (
          $2::text IS NULL
          OR strpos(lower(id::text), lower($2)) > 0
          OR strpos(lower(passenger_id), lower($2)) > 0
          OR strpos(lower(COALESCE(driver_id, '')), lower($2)) > 0
          OR strpos(
            lower(COALESCE(reserved_driver_id, '')),
            lower($2)
          ) > 0
        )
        AND (
          $3::timestamptz IS NULL
          OR updated_at < $3::timestamptz
          OR (
            updated_at = $3::timestamptz
            AND id < $4::uuid
          )
        )
        AND (
          $5::timestamptz IS NULL
          OR created_at >= $5::timestamptz
        )
        AND (
          $6::timestamptz IS NULL
          OR created_at <= $6::timestamptz
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT $7
      `,
      [
        input.states ?? null,
        input.search?.trim() || null,
        input.cursor?.updatedAt ?? null,
        input.cursor?.id ?? null,
        input.createdFrom ?? null,
        input.createdTo ?? null,
        input.limit + 1,
      ],
    );

    const hasMore = result.rows.length > input.limit;
    return {
      rides: result.rows
        .slice(0, input.limit)
        .map(mapRow),
      hasMore,
    };
  }

  async getAdminOperationalSummary(
    since: string,
  ): Promise<AdminRideOperationalSummary> {
    const result = await this.pool.query<AdminRideOperationalSummary>(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE state IN (
            'PAID',
            'SEARCHING_DRIVER',
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'IN_PROGRESS'
          )
        )::int AS active,
        COUNT(*) FILTER (
          WHERE state IN ('PAID', 'SEARCHING_DRIVER')
        )::int AS "searchingDriver",
        COUNT(*) FILTER (
          WHERE state IN (
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED'
          )
        )::int AS "driverOnTheWay",
        COUNT(*) FILTER (
          WHERE state = 'IN_PROGRESS'
        )::int AS "inProgress",
        COUNT(*) FILTER (
          WHERE state = 'COMPLETED'
            AND updated_at >= $1::timestamptz
        )::int AS "completedLast24h",
        COUNT(*) FILTER (
          WHERE state IN (
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'CANCELLED_BY_ADMIN'
          )
            AND updated_at >= $1::timestamptz
        )::int AS "cancelledLast24h"
      FROM rides
      `,
      [since],
    );

    return result.rows[0] ?? {
      active: 0,
      searchingDriver: 0,
      driverOnTheWay: 0,
      inProgress: 0,
      completedLast24h: 0,
      cancelledLast24h: 0,
    };
  }

  async listChatMessages(
    rideId: string,
    limit: number,
    beforeId?: string,
  ): Promise<RideChatMessageRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<RideChatMessageRow>(
      `
      SELECT id, ride_id, sender_type, sender_id, body, created_at
      FROM ride_chat_messages
      WHERE ride_id = $1 AND ($3::uuid IS NULL OR (created_at, id) < (
        SELECT created_at, id FROM ride_chat_messages WHERE id = $3 AND ride_id = $1
      ))
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [rideId, safeLimit, beforeId ?? null],
    );
    return result.rows
      .reverse()
      .map((row) => ({
        id: row.id,
        rideId: row.ride_id,
        senderType: row.sender_type,
        senderId: row.sender_id,
        body: row.body,
        createdAt: row.created_at.toISOString(),
      }));
  }

  async countUnreadChatMessages(rideId: string, readerType: RideChatSenderType, readerId: string): Promise<number> {
    const result = await this.pool.query<{count: string}>(`
      SELECT count(*)::text AS count FROM ride_chat_messages m
      WHERE m.ride_id = $1 AND m.sender_type <> $2 AND NOT EXISTS (
        SELECT 1 FROM ride_chat_reads r WHERE r.message_id = m.id
          AND r.reader_type = $2 AND r.reader_id = $3
      )`, [rideId, readerType, readerId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  async markChatMessagesRead(rideId: string, readerType: RideChatSenderType, readerId: string, messageIds: string[]): Promise<void> {
    await this.pool.query(`
      INSERT INTO ride_chat_reads (message_id, reader_type, reader_id)
      SELECT id, $2, $3 FROM ride_chat_messages
      WHERE ride_id = $1 AND sender_type <> $2 AND id = ANY($4::uuid[])
      ON CONFLICT DO NOTHING`, [rideId, readerType, readerId, messageIds]);
  }

  async appendChatMessage(
    message: RideChatMessageRecord,
  ): Promise<RideChatMessageRecord> {
    const result = await this.pool.query<RideChatMessageRow>(
      `
      INSERT INTO ride_chat_messages (
        id, ride_id, sender_type, sender_id, body, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, ride_id, sender_type, sender_id, body, created_at
      `,
      [
        message.id,
        message.rideId,
        message.senderType,
        message.senderId,
        message.body,
        message.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Mensagem da corrida não foi persistida.');
    }
    return {
      id: row.id,
      rideId: row.ride_id,
      senderType: row.sender_type,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at.toISOString(),
    };
  }

  async save(ride: RideRecord): Promise<RideRecord> {
    const result = await this.pool.query<RideRow>(
      `
      UPDATE rides
      SET
        state = $2,
        payment_status = $3,
        payment_method = $4,
        driver_id = $5,
        reserved_driver_id = $6,
        driver_hold_expires_at = $7,
        pickup_latitude = $8,
        pickup_longitude = $9,
        dropoff_latitude = $10,
        dropoff_longitude = $11,
        driver_pickup_distance_km = $12,
        pricing_rule_id = $13,
        base_amount_cents = $14,
        pickup_compensation_cents = $15,
        total_amount_cents = $16,
        platform_commission_cents = $17,
        driver_net_cents = $18,
        promotion_snapshot = $19,
        updated_at = $20,
        payment_expires_at = $21
      WHERE id = $1
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.state,
        ride.paymentStatus,
        ride.paymentMethod ?? null,
        ride.driverId ?? null,
        ride.reservedDriverId ?? null,
        ride.driverHoldExpiresAt ?? null,
        ride.pickupLatitude ?? null,
        ride.pickupLongitude ?? null,
        ride.dropoffLatitude ?? null,
        ride.dropoffLongitude ?? null,
        ride.driverPickupDistanceKm ?? null,
        ride.quote.ruleId,
        ride.quote.baseAmountCents,
        ride.quote.pickupCompensationCents,
        ride.quote.totalAmountCents,
        ride.quote.platformCommissionCents,
        ride.quote.driverNetCents,
        ride.promotion ?? null,
        ride.updatedAt,
        ride.paymentExpiresAt ?? null,
      ],
    );

    const row = result.rows[0];
    if (row == null) throw new Error('Corrida não encontrada no PostgreSQL.');
    return mapRow(row);
  }
}
