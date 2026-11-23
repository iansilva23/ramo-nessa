import type { Pool } from 'pg';

import type {
  DriverDocumentComplianceControl,
  DriverDocumentComplianceRepository,
} from '../driver-document-compliance-repository.js';

interface Row {
  driver_id: string;
  manual_blocked: boolean;
  notified_at: Date | null;
  acknowledged_at: Date | null;
  updated_at: Date;
}

function mapRow(row: Row): DriverDocumentComplianceControl {
  return {
    driverId: row.driver_id,
    manualBlocked: row.manual_blocked,
    ...(row.notified_at == null
      ? {}
      : { notifiedAt: row.notified_at.toISOString() }),
    ...(row.acknowledged_at == null
      ? {}
      : { acknowledgedAt: row.acknowledged_at.toISOString() }),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresDriverDocumentComplianceRepository
  implements DriverDocumentComplianceRepository {
  constructor(private readonly pool: Pool) {}

  async get(
    driverId: string,
  ): Promise<DriverDocumentComplianceControl | null> {
    const result = await this.pool.query<Row>(
      `SELECT driver_id, manual_blocked, notified_at,
              acknowledged_at, updated_at
       FROM driver_document_compliance_controls
       WHERE driver_id = $1
       LIMIT 1`,
      [driverId],
    );
    const row = result.rows[0];
    return row == null ? null : mapRow(row);
  }

  async save(
    input: DriverDocumentComplianceControl,
  ): Promise<DriverDocumentComplianceControl> {
    const result = await this.pool.query<Row>(
      `INSERT INTO driver_document_compliance_controls (
         driver_id, manual_blocked, notified_at,
         acknowledged_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (driver_id) DO UPDATE SET
         manual_blocked = EXCLUDED.manual_blocked,
         notified_at = EXCLUDED.notified_at,
         acknowledged_at = EXCLUDED.acknowledged_at,
         updated_at = EXCLUDED.updated_at
       RETURNING driver_id, manual_blocked, notified_at,
                 acknowledged_at, updated_at`,
      [
        input.driverId,
        input.manualBlocked,
        input.notifiedAt ?? null,
        input.acknowledgedAt ?? null,
        input.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error(
        'Controle documental do motorista não foi persistido.',
      );
    }
    return mapRow(row);
  }
}
