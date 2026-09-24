import type { Pool } from 'pg';

import type { RideRecord } from '../ride.js';
import type {
  AdminRideListInput,
  AdminRideListPage,
  AdminPassengerRideSummary,
  AdminRideOperationalSummary,
  RideRepository,
} from '../ride-repository.js';

interface RideRow {
  id: string;
  passenger_id: string;
  state: RideRecord['state'];
  payment_status: RideRecord['paymentStatus'];
  driver_id: string | null;
  reserved_driver_id: string | null;
  driver_hold_expires_at: Date | null;
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
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RideRow): RideRecord {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    state: row.state,
    paymentStatus: row.payment_status,
    ...(row.driver_id != null ? { driverId: row.driver_id } : {}),
    ...(row.reserved_driver_id != null
      ? { reservedDriverId: row.reserved_driver_id }
      : {}),
    ...(row.driver_hold_expires_at != null
      ? { driverHoldExpiresAt: row.driver_hold_expires_at.toISOString() }
      : {}),
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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const RETURNING = `
  id, passenger_id, state, payment_status, driver_id,
  reserved_driver_id, driver_hold_expires_at,
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
  created_at, updated_at
`;

export class PostgresRideRepository implements RideRepository {
  constructor(private readonly pool: Pool) {}

  async create(ride: RideRecord): Promise<RideRecord> {
    const result = await this.pool.query<RideRow>(
      `
      INSERT INTO rides (
        id, passenger_id, state, payment_status, driver_id,
        reserved_driver_id, driver_hold_expires_at,
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
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      )
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.passengerId,
        ride.state,
        ride.paymentStatus,
        ride.driverId ?? null,
        ride.reservedDriverId ?? null,
        ride.driverHoldExpiresAt ?? null,
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
        ride.createdAt,
        ride.updatedAt,
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
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS',
          'COMPLETED'
        )
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [driverId],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
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
            WHEN state = 'COMPLETED' THEN total_amount_cents
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

  async save(ride: RideRecord): Promise<RideRecord> {
    const result = await this.pool.query<RideRow>(
      `
      UPDATE rides
      SET
        state = $2,
        payment_status = $3,
        driver_id = $4,
        reserved_driver_id = $5,
        driver_hold_expires_at = $6,
        pickup_latitude = $7,
        pickup_longitude = $8,
        dropoff_latitude = $9,
        dropoff_longitude = $10,
        driver_pickup_distance_km = $11,
        pickup_compensation_cents = $12,
        total_amount_cents = $13,
        platform_commission_cents = $14,
        driver_net_cents = $15,
        updated_at = $16
      WHERE id = $1
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.state,
        ride.paymentStatus,
        ride.driverId ?? null,
        ride.reservedDriverId ?? null,
        ride.driverHoldExpiresAt ?? null,
        ride.pickupLatitude ?? null,
        ride.pickupLongitude ?? null,
        ride.dropoffLatitude ?? null,
        ride.dropoffLongitude ?? null,
        ride.driverPickupDistanceKm ?? null,
        ride.quote.pickupCompensationCents,
        ride.quote.totalAmountCents,
        ride.quote.platformCommissionCents,
        ride.quote.driverNetCents,
        ride.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (row == null) throw new Error('Corrida não encontrada no PostgreSQL.');
    return mapRow(row);
  }
}
