import type { Pool } from 'pg';

import type { ServiceCategory } from '../../pricing/types.js';
import type {
  DriverProfileRecord,
  DriverRegistryRepository,
  DriverRegistryStatus,
  DriverVehicleRecord,
} from '../driver-registry-repository.js';

interface DriverProfileRow {
  driver_id: string;
  full_name: string;
  preferred_name: string | null;
  status: DriverRegistryStatus;
  created_at: Date;
  updated_at: Date;
}

interface DriverVehicleRow {
  id: string;
  driver_id: string;
  plate_normalized: string;
  make: string;
  model: string;
  model_year: number;
  color: string;
  categories: string[];
  four_by_four: boolean;
  seat_capacity: number;
  status: DriverRegistryStatus;
  created_at: Date;
  updated_at: Date;
}

function mapProfile(row: DriverProfileRow): DriverProfileRecord {
  return {
    driverId: row.driver_id,
    fullName: row.full_name,
    ...(row.preferred_name != null
      ? { preferredName: row.preferred_name }
      : {}),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapVehicle(row: DriverVehicleRow): DriverVehicleRecord {
  return {
    id: row.id,
    driverId: row.driver_id,
    plateNormalized: row.plate_normalized,
    make: row.make,
    model: row.model,
    modelYear: row.model_year,
    color: row.color,
    categories: row.categories as ServiceCategory[],
    fourByFour: row.four_by_four,
    seatCapacity: row.seat_capacity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresDriverRegistryRepository
  implements DriverRegistryRepository {
  constructor(private readonly pool: Pool) {}

  async findProfile(
    driverId: string,
  ): Promise<DriverProfileRecord | null> {
    const result = await this.pool.query<DriverProfileRow>(
      'SELECT * FROM driver_profiles WHERE driver_id = $1 LIMIT 1',
      [driverId],
    );
    return result.rows[0] == null ? null : mapProfile(result.rows[0]);
  }

  async upsertProfile(
    record: DriverProfileRecord,
  ): Promise<DriverProfileRecord> {
    const result = await this.pool.query<DriverProfileRow>(
      `
      INSERT INTO driver_profiles (
        driver_id, full_name, preferred_name, status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (driver_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        preferred_name = EXCLUDED.preferred_name,
        updated_at = EXCLUDED.updated_at
      RETURNING *
      `,
      [
        record.driverId,
        record.fullName,
        record.preferredName ?? null,
        record.status,
        record.createdAt,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Perfil do motorista não foi persistido.');
    return mapProfile(row);
  }

  async setProfileStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverProfileRecord | null> {
    const result = await this.pool.query<DriverProfileRow>(
      `
      UPDATE driver_profiles
      SET status = $2, updated_at = $3
      WHERE driver_id = $1
      RETURNING *
      `,
      [input.driverId, input.status, input.updatedAt],
    );
    return result.rows[0] == null ? null : mapProfile(result.rows[0]);
  }

  async findVehicleByDriverId(
    driverId: string,
  ): Promise<DriverVehicleRecord | null> {
    const result = await this.pool.query<DriverVehicleRow>(
      'SELECT * FROM driver_vehicles WHERE driver_id = $1 LIMIT 1',
      [driverId],
    );
    return result.rows[0] == null ? null : mapVehicle(result.rows[0]);
  }

  async findVehicleByPlate(
    plateNormalized: string,
  ): Promise<DriverVehicleRecord | null> {
    const result = await this.pool.query<DriverVehicleRow>(
      'SELECT * FROM driver_vehicles WHERE plate_normalized = $1 LIMIT 1',
      [plateNormalized],
    );
    return result.rows[0] == null ? null : mapVehicle(result.rows[0]);
  }

  async upsertVehicle(
    record: DriverVehicleRecord,
  ): Promise<DriverVehicleRecord> {
    const result = await this.pool.query<DriverVehicleRow>(
      `
      INSERT INTO driver_vehicles (
        id, driver_id, plate_normalized, make, model, model_year,
        color, categories, four_by_four, seat_capacity, status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (driver_id)
      DO UPDATE SET
        plate_normalized = EXCLUDED.plate_normalized,
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        model_year = EXCLUDED.model_year,
        color = EXCLUDED.color,
        categories = EXCLUDED.categories,
        four_by_four = EXCLUDED.four_by_four,
        seat_capacity = EXCLUDED.seat_capacity,
        updated_at = EXCLUDED.updated_at
      RETURNING *
      `,
      [
        record.id,
        record.driverId,
        record.plateNormalized,
        record.make,
        record.model,
        record.modelYear,
        record.color,
        record.categories,
        record.fourByFour,
        record.seatCapacity,
        record.status,
        record.createdAt,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Veículo do motorista não foi persistido.');
    return mapVehicle(row);
  }

  async setVehicleStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverVehicleRecord | null> {
    const result = await this.pool.query<DriverVehicleRow>(
      `
      UPDATE driver_vehicles
      SET status = $2, updated_at = $3
      WHERE driver_id = $1
      RETURNING *
      `,
      [input.driverId, input.status, input.updatedAt],
    );
    return result.rows[0] == null ? null : mapVehicle(result.rows[0]);
  }
}
