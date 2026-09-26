import type { Pool } from 'pg';

import type { ServiceCategory } from '../../pricing/types.js';
import type {
  DriverProfileRecord,
  DriverRatingResult,
  DriverRegistryRepository,
  DriverRegistryStatus,
  DriverVehicleRecord,
} from '../driver-registry-repository.js';

interface DriverProfileRow {
  driver_id: string;
  full_name: string;
  preferred_name: string | null;
  status: DriverRegistryStatus;
  photo_mime_type: string | null;
  photo_updated_at: Date | null;
  rating_sum: number;
  rating_count: number;
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
    ...(row.photo_updated_at == null
      ? {}
      : { photoUpdatedAt: row.photo_updated_at.toISOString() }),
    ...(row.rating_count > 0
      ? { ratingAverage: row.rating_sum / row.rating_count }
      : {}),
    ratingCount: row.rating_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PROFILE_COLUMNS = `
  driver_id, full_name, preferred_name, status,
  photo_mime_type, photo_updated_at, rating_sum, rating_count,
  created_at, updated_at
`;

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
      `SELECT ${PROFILE_COLUMNS} FROM driver_profiles WHERE driver_id = $1 LIMIT 1`,
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
      RETURNING ${PROFILE_COLUMNS}
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
      RETURNING ${PROFILE_COLUMNS}
      `,
      [input.driverId, input.status, input.updatedAt],
    );
    return result.rows[0] == null ? null : mapProfile(result.rows[0]);
  }

  async updateProfilePhoto(input: {
    driverId: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  }): Promise<DriverProfileRecord | null> {
    const result = await this.pool.query<DriverProfileRow>(
      `
      UPDATE driver_profiles
      SET
        photo_bytes = $2,
        photo_mime_type = $3,
        photo_updated_at = $4,
        updated_at = $4
      WHERE driver_id = $1
      RETURNING ${PROFILE_COLUMNS}
      `,
      [
        input.driverId,
        input.bytes,
        input.mimeType,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapProfile(result.rows[0]);
  }

  async findProfilePhoto(driverId: string): Promise<{
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  } | null> {
    const result = await this.pool.query<{
      photo_bytes: Buffer | null;
      photo_mime_type: string | null;
      photo_updated_at: Date | null;
    }>(
      `
      SELECT photo_bytes, photo_mime_type, photo_updated_at
      FROM driver_profiles
      WHERE driver_id = $1
      LIMIT 1
      `,
      [driverId],
    );
    const row = result.rows[0];
    if (
      row?.photo_bytes == null ||
      row.photo_mime_type == null ||
      row.photo_updated_at == null
    ) {
      return null;
    }
    if (
      row.photo_mime_type !== 'image/jpeg' &&
      row.photo_mime_type !== 'image/png' &&
      row.photo_mime_type !== 'image/webp'
    ) {
      return null;
    }

    return {
      bytes: row.photo_bytes,
      mimeType: row.photo_mime_type,
      updatedAt: row.photo_updated_at.toISOString(),
    };
  }

  async submitRating(input: {
    rideId: string;
    passengerId: string;
    driverId: string;
    stars: number;
    createdAt: string;
  }): Promise<DriverRatingResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query<{ stars: number }>(
        `
        INSERT INTO driver_ratings (
          ride_id, passenger_id, driver_id, stars, created_at
        ) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (ride_id) DO NOTHING
        RETURNING stars
        `,
        [
          input.rideId,
          input.passengerId,
          input.driverId,
          input.stars,
          input.createdAt,
        ],
      );

      let stars = inserted.rows[0]?.stars;
      let duplicate = false;

      if (stars == null) {
        duplicate = true;
        const existing = await client.query<{
          stars: number;
          driver_id: string;
        }>(
          `
          SELECT stars, driver_id
          FROM driver_ratings
          WHERE ride_id = $1
          LIMIT 1
          `,
          [input.rideId],
        );
        const row = existing.rows[0];
        if (row == null) {
          throw new Error('Avaliação existente não encontrada.');
        }
        stars = row.stars;
      } else {
        await client.query(
          `
          UPDATE driver_profiles
          SET
            rating_sum = rating_sum + $2,
            rating_count = rating_count + 1,
            updated_at = $3
          WHERE driver_id = $1
          `,
          [input.driverId, input.stars, input.createdAt],
        );
      }

      const aggregate = await client.query<{
        rating_sum: number;
        rating_count: number;
      }>(
        `
        SELECT rating_sum, rating_count
        FROM driver_profiles
        WHERE driver_id = $1
        LIMIT 1
        `,
        [input.driverId],
      );
      const profile = aggregate.rows[0];
      if (profile == null) {
        throw new Error('Perfil do motorista não encontrado.');
      }

      await client.query('COMMIT');
      return {
        stars,
        ratingAverage:
          profile.rating_count === 0
            ? 0
            : profile.rating_sum / profile.rating_count,
        ratingCount: profile.rating_count,
        duplicate,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
