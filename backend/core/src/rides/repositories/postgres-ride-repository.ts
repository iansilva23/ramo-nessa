import type { Pool } from 'pg';

import type { RideRecord } from '../ride.js';
import type { RideRepository } from '../ride-repository.js';

interface RideRow {
  id: string;
  passenger_id: string;
  state: RideRecord['state'];
  payment_status: RideRecord['paymentStatus'];
  driver_id: string | null;
  origin_zone_id: RideRecord['origin']['zoneId'];
  origin_locality_id: string | null;
  destination_zone_id: RideRecord['destination']['zoneId'];
  destination_locality_id: string | null;
  category: RideRecord['category'];
  price_period: RideRecord['period'];
  passengers: number;
  trip_distance_km: string | null;
  driver_pickup_distance_km: string | null;
  pricing_rule_id: string;
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
  origin_zone_id, origin_locality_id,
  destination_zone_id, destination_locality_id,
  category, price_period, passengers,
  trip_distance_km, driver_pickup_distance_km,
  pricing_rule_id, base_amount_cents, pickup_compensation_cents,
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
        origin_zone_id, origin_locality_id,
        destination_zone_id, destination_locality_id,
        category, price_period, passengers,
        trip_distance_km, driver_pickup_distance_km,
        pricing_rule_id, base_amount_cents, pickup_compensation_cents,
        total_amount_cents, platform_commission_cents, driver_net_cents,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,$22
      )
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.passengerId,
        ride.state,
        ride.paymentStatus,
        ride.driverId ?? null,
        ride.origin.zoneId,
        ride.origin.localityId ?? null,
        ride.destination.zoneId,
        ride.destination.localityId ?? null,
        ride.category,
        ride.period,
        ride.passengers,
        ride.tripDistanceKm ?? null,
        ride.driverPickupDistanceKm ?? null,
        ride.quote.ruleId,
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

  async save(ride: RideRecord): Promise<RideRecord> {
    const result = await this.pool.query<RideRow>(
      `
      UPDATE rides
      SET
        state = $2,
        payment_status = $3,
        driver_id = $4,
        driver_pickup_distance_km = $5,
        pickup_compensation_cents = $6,
        total_amount_cents = $7,
        platform_commission_cents = $8,
        driver_net_cents = $9,
        updated_at = $10
      WHERE id = $1
      RETURNING ${RETURNING}
      `,
      [
        ride.id,
        ride.state,
        ride.paymentStatus,
        ride.driverId ?? null,
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
