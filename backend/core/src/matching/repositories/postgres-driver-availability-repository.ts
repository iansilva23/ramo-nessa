import type { Pool } from 'pg';

import type { ServiceCategory } from '../../pricing/types.js';
import type { DriverAvailability } from '../driver-availability.js';
import { validateDriverAvailability } from '../driver-availability.js';
import type { DriverAvailabilityRepository } from '../driver-availability-repository.js';

interface DriverAvailabilityRow {
  driver_id: string;
  status: DriverAvailability['status'];
  service_categories: ServiceCategory[];
  passenger_capacity: number;
  jeri_4x4_eligible: boolean;
  latitude: string;
  longitude: string;
  last_seen_at: Date;
}

const COLUMNS = `
  driver_id, status, service_categories, passenger_capacity,
  jeri_4x4_eligible, latitude, longitude, last_seen_at
`;

function mapRow(row: DriverAvailabilityRow): DriverAvailability {
  return {
    driverId: row.driver_id,
    status: row.status,
    serviceCategories: row.service_categories,
    passengerCapacity: row.passenger_capacity,
    jeri4x4Eligible: row.jeri_4x4_eligible,
    position: {
      lat: Number(row.latitude),
      lon: Number(row.longitude),
    },
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

export class PostgresDriverAvailabilityRepository
  implements DriverAvailabilityRepository
{
  constructor(private readonly pool: Pool) {}

  async upsert(driver: DriverAvailability): Promise<DriverAvailability> {
    validateDriverAvailability(driver);

    const result = await this.pool.query<DriverAvailabilityRow>(
      `
      INSERT INTO driver_availability (
        driver_id, status, service_categories, passenger_capacity,
        jeri_4x4_eligible, latitude, longitude, last_seen_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (driver_id) DO UPDATE SET
        status = EXCLUDED.status,
        service_categories = EXCLUDED.service_categories,
        passenger_capacity = EXCLUDED.passenger_capacity,
        jeri_4x4_eligible = EXCLUDED.jeri_4x4_eligible,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        last_seen_at = EXCLUDED.last_seen_at
      RETURNING ${COLUMNS}
      `,
      [
        driver.driverId,
        driver.status,
        driver.serviceCategories,
        driver.passengerCapacity,
        driver.jeri4x4Eligible,
        driver.position.lat,
        driver.position.lon,
        driver.lastSeenAt,
      ],
    );

    const row = result.rows[0];
    if (row == null) {
      throw new Error('PostgreSQL não retornou disponibilidade do motorista.');
    }
    return mapRow(row);
  }

  async findByDriverId(
    driverId: string,
  ): Promise<DriverAvailability | null> {
    const result = await this.pool.query<DriverAvailabilityRow>(
      `SELECT ${COLUMNS}
       FROM driver_availability
       WHERE driver_id = $1
       LIMIT 1`,
      [driverId],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async listAvailable(input: {
    category: ServiceCategory;
    freshAfter: Date;
  }): Promise<DriverAvailability[]> {
    const result = await this.pool.query<DriverAvailabilityRow>(
      `
      SELECT ${COLUMNS}
      FROM driver_availability
      WHERE status = 'available'
        AND $1 = ANY(service_categories)
        AND last_seen_at >= $2
      ORDER BY last_seen_at DESC
      LIMIT 100
      `,
      [input.category, input.freshAfter.toISOString()],
    );

    return result.rows.map(mapRow);
  }
}
