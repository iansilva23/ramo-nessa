#!/usr/bin/env python3
"""One-account reset for disposable Ramo Nessa registrations."""
import argparse
import json
import re
import subprocess
import sys

CORE = 'ramo-nessa-staging-core-1'

PROBE = r"""
import { readFileSync } from 'node:fs';
import { createPostgresPool } from '/app/dist/src/db/postgres.js';

const { role, email, confirmedId } = JSON.parse(readFileSync(0, 'utf8'));
const pool = createPostgresPool(process.env.DATABASE_URL);
const client = await pool.connect();

const cascade = {
  auth_identities: new Set([
    'auth_federated_identities', 'auth_recovery_challenges', 'auth_recovery_contacts',
    'driver_login_credentials', 'legal_document_acceptances', 'privacy_preferences',
  ]),
  auth_sessions: new Set(['auth_recovery_challenges', 'push_devices']),
};
const accounted = new Set([
  'auth_identities', 'auth_sessions', ...cascade.auth_identities, ...cascade.auth_sessions,
  // Security/audit metadata remains in its original record and is never edited by this utility.
  'admin_audit_log',
]);
const quote = identifier => '"' + identifier.replaceAll('"', '""') + '"';

try {
  await client.query(confirmedId ? 'BEGIN' : 'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SET LOCAL statement_timeout = '8s'");
  const found = await client.query(`
    SELECT id, subject_id, email_normalized
      FROM public.auth_identities
     WHERE subject_type = $1 AND email_normalized = $2
     ${confirmedId ? 'FOR UPDATE' : ''}
  `, [role, email]);
  if (found.rowCount !== 1) {
    console.log(JSON.stringify({ state: found.rowCount === 0 ? 'not_found' : 'ambiguous' }));
  } else {
    const account = found.rows[0];
    if (confirmedId && account.id !== confirmedId) throw Error('changed');
    const blockers = new Set();
    const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
    if (!new RegExp('^' + role + '-' + uuid + '$', 'i').test(account.subject_id)) {
      blockers.add('cadastro legado ou identificado manualmente');
    }
    const sessions = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM public.auth_sessions
         WHERE subject_type = $1 AND subject_id = $2
           AND least(expires_at, coalesce(revoked_at, expires_at)) > now() - interval '10 minutes'
      ) AS recent
    `, [role, account.subject_id]);
    if (sessions.rows[0].recent) blockers.add('sessão ativa ou encerrada há menos de dez minutos');
    const { rows: references } = await client.query(`
      SELECT target.relname AS target, ns.nspname AS schema, child.relname AS child
        FROM pg_constraint fk
        JOIN pg_class target ON target.oid = fk.confrelid
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN pg_namespace ns ON ns.oid = child.relnamespace
       WHERE fk.contype = 'f' AND fk.confdeltype = 'c'
         AND fk.confrelid IN ('public.auth_identities'::regclass, 'public.auth_sessions'::regclass)
    `);
    const reviewed = row => row.schema === 'public' && (
      cascade[row.target]?.has(row.child) ||
      (row.target === 'auth_identities' && row.child === 'driver_support_tickets')
    );
    if (references.some(row => !reviewed(row))) {
      blockers.add('dependência de exclusão ainda não revisada');
    }

    const { rows: keys } = await client.query(`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'uuid')
         AND column_name ~ '(^|_)(passenger|driver|subject|identity|sender|recipient|requester|referrer)_id$'
         AND table_name IN (
           SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         )
       ORDER BY table_name, column_name
    `);
    const referencesByTable = new Map();
    for (const { table_name: table, column_name: column } of keys) {
      if (accounted.has(table)) continue;
      const list = referencesByTable.get(table) ?? [];
      list.push(`(${quote(column)}::text IN ($1, $2))`);
      referencesByTable.set(table, list);
    }
    for (const [table, predicates] of referencesByTable) {
      const result = await client.query(
        `SELECT EXISTS (SELECT 1 FROM public.${quote(table)} WHERE ${predicates.join(' OR ')}) AS linked`,
        [account.subject_id, account.id],
      );
      if (result.rows[0].linked) blockers.add(table);
    }
    const finance = await client.query(`
      SELECT EXISTS (SELECT 1 FROM public.ledger_entries WHERE account_key LIKE $1) AS linked
    `, [`${role}:${account.subject_id}:%`]);
    if (finance.rows[0].linked) blockers.add('ledger financeiro');

    if (blockers.size) {
      console.log(JSON.stringify({ state: 'blocked', blockers: [...blockers] }));
    } else if (!confirmedId) {
      console.log(JSON.stringify({ state: 'eligible', id: account.id }));
    } else {
      await client.query(
        'DELETE FROM public.auth_sessions WHERE subject_type = $1 AND subject_id = $2',
        [role, account.subject_id],
      );
      const removed = await client.query(
        'DELETE FROM public.auth_identities WHERE id = $1 AND subject_type = $2 AND email_normalized = $3',
        [account.id, role, email],
      );
      if (removed.rowCount !== 1) throw Error('changed');
      await client.query('COMMIT');
      console.log(JSON.stringify({ state: 'deleted' }));
    }
  }
} catch {
  process.exitCode = 1;
} finally {
  await client.query('ROLLBACK').catch(() => {});
  client.release();
  await pool.end();
}
"""


def probe(role, email, confirmed_id=None):
    result = subprocess.run(
        ['docker', 'exec', '-i', CORE, 'node', '--input-type=module', '-e', PROBE],
        input=json.dumps({'role': role, 'email': email, 'confirmedId': confirmed_id}),
        capture_output=True, text=True, timeout=45,
    )
    if result.returncode != 0:
        raise RuntimeError('A VPS não confirmou o resultado. Confira novamente com a consulta de leitura.')
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description='Consulta e exclusão de um cadastro descartável, sem histórico.')
    parser.add_argument('--excluir', action='store_true', help='Habilita a confirmação explícita da exclusão.')
    args = parser.parse_args()
    role_input = input('Perfil da conta de teste [passageiro/motorista]: ').strip().lower()
    roles = {'passageiro': 'passenger', 'motorista': 'driver'}
    if role_input not in roles:
        sys.exit('Perfil inválido. Nenhuma alteração.')
    role = roles[role_input]
    email = input('E-mail exato da conta de teste: ').strip().lower()
    if len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        sys.exit('E-mail inválido. Nenhuma alteração.')
    result = probe(role, email)
    if result['state'] == 'not_found':
        print('Nenhuma conta desse perfil usa esse e-mail.')
    elif result['state'] == 'ambiguous':
        sys.exit('Mais de um resultado. Nenhuma alteração.')
    elif result['state'] == 'blocked':
        print('A conta não pode ser excluída por este procedimento.')
        print('Motivos: ' + ', '.join(result['blockers']))
    elif not args.excluir:
        print('Cadastro elegível. Consulta concluída, nenhuma alteração.')
    else:
        expected = f'EXCLUIR TESTE {email}'
        print('A exclusão libera os dados de cadastro e é permanente. Apenas para sua conta de teste descartável.')
        if input(f'Digite {expected} para confirmar: ').strip() != expected:
            sys.exit('Confirmação diferente. Nenhuma alteração.')
        deleted = probe(role, email, result['id'])
        if deleted['state'] != 'deleted':
            sys.exit('As condições mudaram. Nenhuma exclusão confirmada.')
        print('CONTA_DE_TESTE_EXCLUIDA. Pode criar o novo cadastro.')

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError, EOFError):
        sys.exit('Operação sem confirmação. Rode primeiro a consulta sem --excluir e confira o resultado.')
