import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthSubjectType } from '../auth/auth-session-repository.js';

const identityChildren = new Set([
  'auth_federated_identities',
  'auth_recovery_challenges',
  'auth_recovery_contacts',
  'driver_login_credentials',
  'legal_document_acceptances',
  'privacy_preferences',
]);
const sessionChildren = new Set(['auth_recovery_challenges', 'push_devices']);
const handledTables = new Set([
  'auth_identities', 'auth_sessions', 'admin_audit_log',
  ...identityChildren, ...sessionChildren,
]);

export class AdminAccountDeletionError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function identifier(value: string) {
  return '"' + value.replaceAll('"', '""') + '"';
}

async function assertNoRelatedHistory(client: PoolClient, id: string, subjectId: string) {
  const { rows: foreignKeys } = await client.query<{
    target: string; child: string; schema: string; action: string;
  }>(`
    SELECT target.relname AS target, child.relname AS child, ns.nspname AS schema, fk.confdeltype AS action
    FROM pg_constraint fk
    JOIN pg_class target ON target.oid = fk.confrelid
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    WHERE fk.contype = 'f' AND fk.confdeltype IN ('c', 'n', 'd')
      AND fk.confrelid IN ('public.auth_identities'::regclass, 'public.auth_sessions'::regclass)
  `);
  const reviewed = (row: typeof foreignKeys[number]) =>
    row.schema === 'public' && row.action === 'c' && (
      row.target === 'auth_identities'
        ? identityChildren.has(row.child) || row.child === 'driver_support_tickets'
        : sessionChildren.has(row.child)
    );
  if (foreignKeys.some(row => !reviewed(row))) {
    throw new AdminAccountDeletionError(409, 'ACCOUNT_RELATION_UNREVIEWED',
      'Há uma dependência de dados que precisa ser revisada antes da exclusão.');
  }

  const { rows: columns } = await client.query<{ table_name: string; column_name: string }>(`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t USING (table_catalog, table_schema, table_name)
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'uuid')
      AND c.column_name ~ '(^|_)(passenger|driver|subject|identity|sender|recipient|requester|referrer)_id$'
    ORDER BY c.table_name, c.column_name
  `);
  const tables = new Map<string, string[]>();
  for (const row of columns) {
    if (handledTables.has(row.table_name)) continue;
    const values = tables.get(row.table_name) ?? [];
    values.push(`${identifier(row.column_name)}::text IN ($1, $2)`);
    tables.set(row.table_name, values);
  }
  for (const [table, predicates] of tables) {
    const result = await client.query<{ linked: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.${identifier(table)} WHERE ${predicates.join(' OR ')}) AS linked`,
      [subjectId, id],
    );
    if (result.rows[0]?.linked) {
      throw new AdminAccountDeletionError(409, 'ACCOUNT_HISTORY_PRESENT',
        'A conta tem histórico ou dados vinculados. Ela precisa de revisão antes da exclusão definitiva.');
    }
  }
}

export class PostgresAdminAccountDeletion {
  constructor(private readonly pool: Pool) {}

  async remove(input: { role: AuthSubjectType; subjectId: string; actor: { id: string; name: string } }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      const identity = (await client.query<{ id: string }>(`
        SELECT id FROM public.auth_identities WHERE subject_type = $1 AND subject_id = $2 FOR UPDATE
      `, [input.role, input.subjectId])).rows[0];
      if (!identity) {
        throw new AdminAccountDeletionError(404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
      }

      const { rows: sessions } = await client.query<{ recent: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM public.auth_sessions
          WHERE subject_type = $1 AND subject_id = $2
            AND least(expires_at, coalesce(revoked_at, expires_at)) > now() - interval '10 minutes'
        ) AS recent
      `, [input.role, input.subjectId]);
      if (sessions[0]?.recent) {
        throw new AdminAccountDeletionError(409, 'ACCOUNT_SESSION_RECENT',
          'Há uma sessão ativa ou recente. Encerre o acesso à conta e aguarde 10 minutos antes de excluir.');
      }

      const { rows: finance } = await client.query<{ linked: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM public.ledger_entries WHERE starts_with(account_key, $1)) AS linked
      `, [`${input.role}:${input.subjectId}:`]);
      if (finance[0]?.linked) {
        throw new AdminAccountDeletionError(409, 'ACCOUNT_FINANCIAL_HISTORY',
          'A conta tem registros financeiros. Revise o saldo e o histórico antes da exclusão.');
      }

      await assertNoRelatedHistory(client, identity.id, input.subjectId);
      await client.query('DELETE FROM public.auth_sessions WHERE subject_type = $1 AND subject_id = $2',
        [input.role, input.subjectId]);
      await client.query('DELETE FROM public.auth_identities WHERE id = $1', [identity.id]);
      await client.query(`
        INSERT INTO public.admin_audit_log
          (id, actor_user_id, actor_name, action, target_type, target_id, metadata, created_at)
        VALUES ($1, $2, $3, 'account.deleted', $4, $5, '{}'::jsonb, now())
      `, [randomUUID(), input.actor.id, input.actor.name, input.role, input.subjectId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
