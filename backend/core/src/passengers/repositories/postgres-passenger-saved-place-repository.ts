import type { Pool } from 'pg';

import type {
  PassengerSavedPlaceKind,
  PassengerSavedPlaceRecord,
  PassengerSavedPlaceRepository,
} from '../passenger-saved-place-repository.js';

interface PassengerSavedPlaceRow {
  id: string;
  passenger_id: string;
  kind: PassengerSavedPlaceKind;
  label: string;
  name: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  created_at: Date;
  updated_at: Date;
}

function mapPlace(
  row: PassengerSavedPlaceRow,
): PassengerSavedPlaceRecord {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    kind: row.kind,
    label: row.label,
    name: row.name,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = `
  id, passenger_id, kind, label, name, address,
  latitude, longitude, created_at, updated_at
`;

export class PostgresPassengerSavedPlaceRepository
  implements PassengerSavedPlaceRepository {
  constructor(private readonly pool: Pool) {}

  async listByPassenger(
    passengerId: string,
  ): Promise<PassengerSavedPlaceRecord[]> {
    const result = await this.pool.query<PassengerSavedPlaceRow>(
      `
      SELECT ${COLUMNS}
      FROM passenger_saved_places
      WHERE passenger_id = $1
      ORDER BY
        CASE kind
          WHEN 'home' THEN 0
          WHEN 'work' THEN 1
          ELSE 2
        END,
        updated_at DESC,
        id DESC
      `,
      [passengerId],
    );
    return result.rows.map(mapPlace);
  }

  async save(
    place: PassengerSavedPlaceRecord,
  ): Promise<PassengerSavedPlaceRecord> {
    const special = place.kind !== 'custom';
    const sql = special
      ? `
        INSERT INTO passenger_saved_places (
          id, passenger_id, kind, label, name, address,
          latitude, longitude, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (passenger_id, kind)
          WHERE kind IN ('home', 'work')
        DO UPDATE SET
          label = EXCLUDED.label,
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          updated_at = EXCLUDED.updated_at
        RETURNING ${COLUMNS}
        `
      : `
        INSERT INTO passenger_saved_places (
          id, passenger_id, kind, label, name, address,
          latitude, longitude, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING ${COLUMNS}
        `;

    const result = await this.pool.query<PassengerSavedPlaceRow>(
      sql,
      [
        place.id,
        place.passengerId,
        place.kind,
        place.label,
        place.name,
        place.address,
        place.latitude,
        place.longitude,
        place.createdAt,
        place.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Local salvo não foi persistido.');
    }
    return mapPlace(row);
  }

  async deleteByPassenger(input: {
    passengerId: string;
    id: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `
      DELETE FROM passenger_saved_places
      WHERE passenger_id = $1 AND id = $2
      `,
      [input.passengerId, input.id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
