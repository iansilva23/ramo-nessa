import type { Pool } from 'pg';

import type {
  DriverSupportCategory,
  DriverSupportRepository,
  DriverSupportStatus,
  DriverSupportTicketRecord,
} from '../driver-support-repository.js';

interface DriverSupportTicketRow {
  id: string;
  driver_id: string;
  category: DriverSupportCategory;
  subject: string;
  message: string;
  status: DriverSupportStatus;
  response: string | null;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapTicket(
  row: DriverSupportTicketRow,
): DriverSupportTicketRecord {
  return {
    id: row.id,
    driverId: row.driver_id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    ...(row.response == null ? {} : { response: row.response }),
    ...(row.responded_at == null
      ? {}
      : { respondedAt: row.responded_at.toISOString() }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = `
  id, driver_id, category, subject, message, status,
  response, responded_at, created_at, updated_at
`;

export class PostgresDriverSupportRepository
  implements DriverSupportRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    ticket: DriverSupportTicketRecord,
  ): Promise<DriverSupportTicketRecord> {
    const result = await this.pool.query<DriverSupportTicketRow>(
      `
      INSERT INTO driver_support_tickets (
        id, driver_id, category, subject, message, status,
        response, responded_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING ${COLUMNS}
      `,
      [
        ticket.id,
        ticket.driverId,
        ticket.category,
        ticket.subject,
        ticket.message,
        ticket.status,
        ticket.response ?? null,
        ticket.respondedAt ?? null,
        ticket.createdAt,
        ticket.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Chamado não foi persistido.');
    return mapTicket(row);
  }

  async listByDriver(
    driverId: string,
    limit: number,
  ): Promise<DriverSupportTicketRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<DriverSupportTicketRow>(
      `
      SELECT ${COLUMNS}
      FROM driver_support_tickets
      WHERE driver_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [driverId, safeLimit],
    );
    return result.rows.map(mapTicket);
  }

  async findById(
    id: string,
  ): Promise<DriverSupportTicketRecord | null> {
    const result = await this.pool.query<DriverSupportTicketRow>(
      `
      SELECT ${COLUMNS}
      FROM driver_support_tickets
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );
    return result.rows[0] == null ? null : mapTicket(result.rows[0]);
  }

  async listRecent(limit: number): Promise<DriverSupportTicketRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<DriverSupportTicketRow>(
      `
      SELECT ${COLUMNS}
      FROM driver_support_tickets
      ORDER BY created_at DESC, id DESC
      LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows.map(mapTicket);
  }

  async respond(input: {
    id: string;
    response: string;
    status: 'in_progress' | 'resolved' | 'closed';
    respondedAt: string;
  }): Promise<DriverSupportTicketRecord | null> {
    const result = await this.pool.query<DriverSupportTicketRow>(
      `
      UPDATE driver_support_tickets
      SET
        response = $2,
        responded_at = $3,
        status = $4,
        updated_at = $3
      WHERE id = $1
      RETURNING ${COLUMNS}
      `,
      [input.id, input.response, input.respondedAt, input.status],
    );
    return result.rows[0] == null ? null : mapTicket(result.rows[0]);
  }
}
