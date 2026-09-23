import type { Pool } from 'pg';

import {
  validateDriverSupply,
  type DriverSupplyRecord,
} from '../driver-supply.js';
import type { DriverSupplyRepository } from '../driver-supply-repository.js';
import type { ServiceCategory } from '../../pricing/types.js';

interface DriverSupplyRow {
  driver_id: string;
  vehicle_id: string;
  categories: string[];
  four_by_four: boolean;
  seat_capacity: number;
  online: boolean;
  busy: boolean;
  reserved_ride_id: string | null;
  reserved_until: Date | null;
  latitude: string;
  longitude: string;
  location_updated_at: Date;
  updated_at: Date;
}

const COLUMNS = `
  driver_id, vehicle_id, categories, four_by_four, seat_capacity,
  online, busy, reserved_ride_id, reserved_until,
  latitude, longitude, location_updated_at, updated_at
`;

function mapRow(row: DriverSupplyRow): DriverSupplyRecord {
  return {
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    categories: row.categories as ServiceCategory[],
    fourByFour: row.four_by_four,
    seatCapacity: row.seat_capacity,
    online: row.online,
    busy: row.busy,
    ...(row.reserved_ride_id != null
      ? { reservedRideId: row.reserved_ride_id }
      : {}),
    ...(row.reserved_until != null
      ? { reservedUntil: row.reserved_until.toISOString() }
      : {}),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    locationUpdatedAt: row.location_updated_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresDriverSupplyRepository
    implements DriverSupplyRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(supply: DriverSupplyRecord): Promise<DriverSupplyRecord> {
    validateDriverSupply(supply);

    const result = await this.pool.query<DriverSupplyRow>(
      `
      INSERT INTO driver_supply (
        driver_id, vehicle_id, categories, four_by_four, seat_capacity,
        online, busy, reserved_ride_id, reserved_until,
        latitude, longitude, location_updated_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (driver_id)
      DO UPDATE SET
        vehicle_id = EXCLUDED.vehicle_id,
        categories = EXCLUDED.categories,
        four_by_four = EXCLUDED.four_by_four,
        seat_capacity = EXCLUDED.seat_capacity,
        online = EXCLUDED.online,
        busy = EXCLUDED.busy,
        reserved_ride_id = EXCLUDED.reserved_ride_id,
        reserved_until = EXCLUDED.reserved_until,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location_updated_at = EXCLUDED.location_updated_at,
        updated_at = EXCLUDED.updated_at
      RETURNING ${COLUMNS}
      `,
      [
        supply.driverId,
        supply.vehicleId,
        supply.categories,
        supply.fourByFour,
        supply.seatCapacity,
        supply.online,
        supply.busy,
        supply.reservedRideId ?? null,
        supply.reservedUntil ?? null,
        supply.latitude,
        supply.longitude,
        supply.locationUpdatedAt,
        supply.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (row == null) throw new Error('PostgreSQL não retornou driver_supply.');
    return mapRow(row);
  }

  async findByDriverId(
    driverId: string,
  ): Promise<DriverSupplyRecord | null> {
    const result = await this.pool.query<DriverSupplyRow>(
      `SELECT ${COLUMNS}
       FROM driver_supply
       WHERE driver_id = $1
       LIMIT 1`,
      [driverId],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async listOnline(): Promise<DriverSupplyRecord[]> {
    const result = await this.pool.query<DriverSupplyRow>(
      `SELECT ${COLUMNS}
       FROM driver_supply
       WHERE online = TRUE
         AND busy = FALSE
       ORDER BY location_updated_at DESC`,
    );
    return result.rows.map(mapRow);
  }
}
