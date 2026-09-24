import type { Pool, PoolClient } from 'pg';

import type { AuthSubjectType } from '../../auth/auth-session-repository.js';
import type {
  PushDeviceRecord,
  PushDeviceRepository,
  PushPlatform,
  PushTokenProvider,
  RegisterPushDeviceInput,
} from '../push-device-repository.js';

interface PushDeviceRow {
  id: string;
  session_id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  platform: PushPlatform;
  provider: PushTokenProvider;
  token: string;
  token_hash: string;
  enabled: boolean;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapDevice(row: PushDeviceRow): PushDeviceRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    platform: row.platform,
    provider: row.provider,
    token: row.token,
    tokenHash: row.token_hash,
    enabled: row.enabled,
    ...(row.disabled_at == null
      ? {}
      : { disabledAt: row.disabled_at.toISOString() }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function registerWithClient(
  client: PoolClient,
  input: RegisterPushDeviceInput,
): Promise<PushDeviceRecord> {
  await client.query(
    `UPDATE push_devices
     SET enabled = false,
         disabled_at = $2,
         updated_at = $2
     WHERE session_id = $1
       AND enabled = true
       AND token_hash <> $3`,
    [input.sessionId, input.updatedAt, input.tokenHash],
  );

  const result = await client.query<PushDeviceRow>(
    `INSERT INTO push_devices (
       id, session_id, subject_id, subject_type, platform, provider,
       token, token_hash, enabled, disabled_at, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NULL,$9,$10)
     ON CONFLICT (token_hash)
     DO UPDATE SET
       session_id = EXCLUDED.session_id,
       subject_id = EXCLUDED.subject_id,
       subject_type = EXCLUDED.subject_type,
       platform = EXCLUDED.platform,
       provider = EXCLUDED.provider,
       token = EXCLUDED.token,
       enabled = true,
       disabled_at = NULL,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      input.id,
      input.sessionId,
      input.subjectId,
      input.subjectType,
      input.platform,
      input.provider,
      input.token,
      input.tokenHash,
      input.createdAt,
      input.updatedAt,
    ],
  );
  const row = result.rows[0];
  if (row == null) {
    throw new Error('Dispositivo push não pôde ser persistido.');
  }
  return mapDevice(row);
}

export class PostgresPushDeviceRepository
  implements PushDeviceRepository {
  constructor(private readonly pool: Pool) {}

  async registerForSession(
    input: RegisterPushDeviceInput,
  ): Promise<PushDeviceRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const device = await registerWithClient(client, input);
      await client.query('COMMIT');
      return device;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listEnabledForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<PushDeviceRecord[]> {
    const result = await this.pool.query<PushDeviceRow>(
      `SELECT *
       FROM push_devices
       WHERE subject_type = $1
         AND subject_id = $2
         AND enabled = true
       ORDER BY updated_at DESC`,
      [subjectType, subjectId],
    );
    return result.rows.map(mapDevice);
  }

  async disableForSession(
    sessionId: string,
    disabledAt: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `UPDATE push_devices
       SET enabled = false,
           disabled_at = $2,
           updated_at = $2
       WHERE session_id = $1
         AND enabled = true`,
      [sessionId, disabledAt],
    );
    return result.rowCount ?? 0;
  }

  async disableDevice(
    id: string,
    disabledAt: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE push_devices
       SET enabled = false,
           disabled_at = $2,
           updated_at = $2
       WHERE id = $1
         AND enabled = true`,
      [id, disabledAt],
    );
  }
}
