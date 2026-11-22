import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthSubjectType } from '../auth/auth-session-repository.js';

export class AdminAccountDeletionError extends Error {
  constructor(
    public readonly status: 404 | 422 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class PostgresAdminAccountDeletion {
  constructor(private readonly pool: Pool) {}

  async remove(input: { role: AuthSubjectType; subjectId: string; actor: { id: string; name: string } }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      const schema = await client.query<{ ready: boolean }>(`
        SELECT to_regprocedure('public.prevent_closed_account_reuse()') IS NOT NULL AS ready
      `);
      if (schema.rows[0]?.ready !== true) {
        throw new AdminAccountDeletionError(503, 'ACCOUNT_DELETE_UNAVAILABLE',
          'A atualização de exclusão de contas ainda não foi concluída.');
      }
      const identity = (await client.query<{ id: string }>(`
        SELECT id FROM public.auth_identities WHERE subject_type = $1 AND subject_id = $2 FOR UPDATE
      `, [input.role, input.subjectId])).rows[0];
      if (!identity) {
        throw new AdminAccountDeletionError(404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
      }
      if (input.role === 'driver') {
        await client.query("UPDATE public.driver_supply SET online = false, updated_at = now() WHERE driver_id = $1",
          [input.subjectId]);
        await client.query("UPDATE public.driver_profiles SET status = 'suspended', updated_at = now() WHERE driver_id = $1",
          [input.subjectId]);
      }
      const sessions = await client.query<{ id: string }>(
        'DELETE FROM public.auth_sessions WHERE subject_type = $1 AND subject_id = $2 RETURNING id',
        [input.role, input.subjectId],
      );
      await client.query('DELETE FROM public.auth_identities WHERE id = $1', [identity.id]);
      await client.query(`
        INSERT INTO public.admin_audit_log
          (id, actor_user_id, actor_name, action, target_type, target_id, metadata, created_at)
        VALUES ($1, $2, $3, 'account.deleted', $4, $5, jsonb_build_object('revokedSessions', $6::integer), now())
      `, [randomUUID(), input.actor.id, input.actor.name, input.role, input.subjectId, sessions.rowCount ?? 0]);
      await client.query('COMMIT');
      return sessions.rows.map(row => row.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
