import type { Pool } from 'pg';

import type {
  OperationalSettingsRecord,
  OperationalSettingsRepository,
} from './operational-settings-repository.js';

interface OperationalSettingsRow {
  driver_offer_ttl_seconds: number;
  show_nearby_drivers: boolean;
  updated_at: Date;
}

function mapRow(row: OperationalSettingsRow): OperationalSettingsRecord {
  return {
    driverOfferTtlSeconds: row.driver_offer_ttl_seconds,
    showNearbyDrivers: row.show_nearby_drivers,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresOperationalSettingsRepository
  implements OperationalSettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async get(): Promise<OperationalSettingsRecord> {
    const result = await this.pool.query<OperationalSettingsRow>(
      `SELECT driver_offer_ttl_seconds, show_nearby_drivers, updated_at
       FROM operational_settings
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração operacional não foi inicializada.');
    }
    return mapRow(row);
  }

  async update(input: {
    driverOfferTtlSeconds?: number;
    showNearbyDrivers?: boolean;
    updatedAt: string;
  }): Promise<OperationalSettingsRecord> {
    const current = await this.get();
    const result = await this.pool.query<OperationalSettingsRow>(
      `UPDATE operational_settings
       SET driver_offer_ttl_seconds = $1,
           show_nearby_drivers = $2,
           updated_at = $3
       WHERE id = 1
       RETURNING driver_offer_ttl_seconds, show_nearby_drivers, updated_at`,
      [
        input.driverOfferTtlSeconds ?? current.driverOfferTtlSeconds,
        input.showNearbyDrivers ?? current.showNearbyDrivers,
        input.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração operacional não foi encontrada.');
    }
    return mapRow(row);
  }
}
