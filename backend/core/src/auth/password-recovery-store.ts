import type { Pool } from 'pg';
import type { AuthSubjectType } from './auth-session-repository.js';
import type { RecoveryChannel } from './recovery-delivery.js';

type Account = {
  id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  email_normalized: string | null;
  phone_e164: string | null;
  password: string | null;
};

type Challenge = {
  id: string;
  identity_id: string;
  channel: RecoveryChannel;
  session_id: string | null;
  destination_hash: string;
  credential_hash: string;
  proof: string;
};

const accountSelect = `
  SELECT a.id, a.subject_id, a.subject_type, a.email_normalized, a.phone_e164,
    CASE WHEN a.subject_type = 'driver' THEN d.password_hash ELSE a.password_hash END AS password
  FROM auth_identities a
  LEFT JOIN driver_login_credentials d ON d.identity_id = a.id
  WHERE a.subject_type = $1 AND a.status = 'active'`;

export function recoveryDestination(account: Account, channel: RecoveryChannel) {
  return channel === 'email' ? account.email_normalized : account.phone_e164;
}

export class PostgresPasswordRecoveryStore {
  constructor(private readonly pool: Pool) {}

  async account(role: AuthSubjectType, identifier: string, subjectId?: string) {
    const where = subjectId != null ? 'a.subject_id = $2'
      : /^\+55[1-9]\d9\d{8}$/.test(identifier) ? 'a.phone_e164 = $2'
      : role === 'driver' ? '(d.username_normalized = $2 OR d.email_normalized = $2)'
      : 'a.email_normalized = $2';
    return (await this.pool.query<Account>(accountSelect + ' AND ' + where,
      [role, subjectId ?? identifier])).rows[0];
  }

  async confirmed(accountId: string, channel: RecoveryChannel, destinationHash: string) {
    const result = await this.pool.query(`
      SELECT 1 FROM auth_recovery_contacts
      WHERE identity_id = $1 AND channel = $2 AND destination_hash = $3
    `, [accountId, channel, destinationHash]);
    return result.rowCount === 1;
  }

  async takeLimit(rules: { key: string; limit: number; windowMs: number }[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM auth_recovery_rate_limits WHERE expires_at <= now()');
      let retryAfterMs = 0;
      for (const rule of [...rules].sort((a, b) => a.key.localeCompare(b.key))) {
        const allowed = await client.query(`
          INSERT INTO auth_recovery_rate_limits (bucket_key, expires_at, attempts)
          VALUES ($1, now() + $2::integer * interval '1 millisecond', 1)
          ON CONFLICT (bucket_key) DO UPDATE SET attempts = auth_recovery_rate_limits.attempts + 1
            WHERE auth_recovery_rate_limits.attempts < $3
          RETURNING bucket_key
        `, [rule.key, rule.windowMs, rule.limit]);
        if (allowed.rowCount !== 1) {
          const current = (await client.query<{ remaining_ms: number }>(`
            SELECT ceil(extract(epoch FROM expires_at - now()) * 1000)::integer AS remaining_ms
            FROM auth_recovery_rate_limits WHERE bucket_key = $1
          `, [rule.key])).rows[0];
          retryAfterMs = Math.max(retryAfterMs, current?.remaining_ms ?? 1000, 1);
        }
      }
      await client.query(retryAfterMs > 0 ? 'ROLLBACK' : 'COMMIT');
      return { allowed: retryAfterMs === 0, retryAfterMs };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async create(challenge: Omit<Challenge, 'proof'>) {
    await this.pool.query('DELETE FROM auth_recovery_challenges WHERE expires_at <= now()');
    await this.pool.query(`
      INSERT INTO auth_recovery_challenges
        (id, identity_id, channel, session_id, destination_hash, credential_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, now() + interval '5 minutes')
    `, [challenge.id, challenge.identity_id, challenge.channel, challenge.session_id,
      challenge.destination_hash, challenge.credential_hash]);
  }

  async setProof(id: string, proof: string) {
    await this.pool.query('UPDATE auth_recovery_challenges SET proof = $2 WHERE id = $1', [id, proof]);
  }

  async claim(id: string, role: AuthSubjectType, sessionId: string | null) {
    return (await this.pool.query<Challenge>(`
      UPDATE auth_recovery_challenges c SET attempts = c.attempts + 1, checking = true
      FROM auth_identities a
      WHERE c.id = $1 AND a.id = c.identity_id AND a.subject_type = $2 AND a.status = 'active'
        AND c.session_id IS NOT DISTINCT FROM $3::uuid
        AND c.expires_at > now() AND c.consumed_at IS NULL AND NOT c.checking
        AND c.attempts < 5 AND c.proof NOT LIKE 'reset:%'
      RETURNING c.*
    `, [id, role, sessionId])).rows[0];
  }

  async authorizeReset(id: string, proof: string) {
    const result = await this.pool.query(`
      UPDATE auth_recovery_challenges c SET proof = $2, checking = false
      WHERE c.id = $1 AND c.session_id IS NULL AND c.checking AND c.consumed_at IS NULL
        AND c.expires_at > now() AND c.proof NOT LIKE 'reset:%'
        AND EXISTS (SELECT 1 FROM auth_recovery_contacts
          WHERE identity_id = c.identity_id AND channel = c.channel AND destination_hash = c.destination_hash)
      RETURNING id
    `, [id, proof]);
    return result.rowCount === 1;
  }

  async claimReset(id: string, role: AuthSubjectType, proof: string) {
    return (await this.pool.query<Challenge>(`
      UPDATE auth_recovery_challenges c SET checking = true
      FROM auth_identities a
      WHERE c.id = $1 AND c.proof = $3 AND c.session_id IS NULL
        AND a.id = c.identity_id AND a.subject_type = $2 AND a.status = 'active'
        AND c.expires_at > now() AND c.consumed_at IS NULL AND NOT c.checking
      RETURNING c.*
    `, [id, role, proof])).rows[0];
  }

  async release(id: string) {
    await this.pool.query('UPDATE auth_recovery_challenges SET checking = false WHERE id = $1', [id]);
  }

  async finish(input: {
    challenge: Challenge;
    role: AuthSubjectType;
    password: string | null;
    isCurrent: (account: Account, challenge: Challenge) => boolean;
  }) {
    const { challenge, role, password } = input;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = (await client.query<Account>(
        accountSelect + ' AND a.id = $2 FOR UPDATE OF a', [role, challenge.identity_id],
      )).rows[0];
      if (account && role === 'driver') {
        account.password = (await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM driver_login_credentials WHERE identity_id = $1 FOR UPDATE', [account.id],
        )).rows[0]?.password_hash ?? null;
      }
      if (!account || !input.isCurrent(account, challenge)) {
        await client.query('ROLLBACK');
        return false;
      }
      const used = await client.query(`
        UPDATE auth_recovery_challenges SET consumed_at = now(), checking = false
        WHERE id = $1 AND checking AND consumed_at IS NULL AND expires_at > now()
        RETURNING id
      `, [challenge.id]);
      if (used.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      if (password === null) {
        const session = await client.query(`
          SELECT id FROM auth_sessions WHERE id = $1 AND subject_type = $2 AND subject_id = $3
            AND revoked_at IS NULL AND expires_at > now() FOR UPDATE
        `, [challenge.session_id, role, account.subject_id]);
        if (session.rowCount !== 1) {
          await client.query('ROLLBACK');
          return false;
        }
        await client.query(`
          INSERT INTO auth_recovery_contacts (identity_id, channel, destination_hash) VALUES ($1, $2, $3)
          ON CONFLICT (identity_id, channel) DO UPDATE SET destination_hash = EXCLUDED.destination_hash
        `, [account.id, challenge.channel, challenge.destination_hash]);
      } else {
        const confirmed = await client.query(`
          SELECT 1 FROM auth_recovery_contacts WHERE identity_id = $1 AND channel = $2 AND destination_hash = $3
        `, [account.id, challenge.channel, challenge.destination_hash]);
        if (confirmed.rowCount !== 1) {
          await client.query('ROLLBACK');
          return false;
        }
        await client.query(role === 'driver'
          ? 'UPDATE driver_login_credentials SET password_hash = $2, version = version + 1, updated_at = now() WHERE identity_id = $1'
          : 'UPDATE auth_identities SET password_hash = $2, updated_at = now() WHERE id = $1', [account.id, password]);
        await client.query(`
          UPDATE auth_sessions SET revoked_at = now()
          WHERE subject_type = $1 AND subject_id = $2 AND revoked_at IS NULL
        `, [role, account.subject_id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
