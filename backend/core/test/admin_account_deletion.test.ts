import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresAdminAccountDeletion } from '../src/admin/admin-account-deletion.js';

test('deletes only the requested profile and rolls back for active sessions or financial records', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new PostgresAdminAccountDeletion(pool);
  const actor = { id: randomUUID(), name: 'Owner CI' };
  const role = 'passenger' as const;
  const subjectId = `ci-${randomUUID()}`;
  const driverId = randomUUID();
  const sessionId = randomUUID();
  const ledgerId = randomUUID();
  const email = `${subjectId}@example.test`;

  try {
    await pool.query(`
      INSERT INTO admin_users(id,name,email_normalized,password_hash,totp_secret_ciphertext,scopes,status,created_at,updated_at)
      VALUES ($1,$2,$3,'test','test',ARRAY['passengers:auth:write'],'active',now(),now())
    `, [actor.id, actor.name, email]);
    await pool.query(`
      INSERT INTO auth_identities(id,subject_type,subject_id,phone_e164,email_normalized,status,created_at,updated_at)
      VALUES ($1,'passenger',$2,'+5588999912340',$3,'active',now(),now()),
        ($4,'driver',$2,'+5588999912340',$3,'active',now(),now())
    `, [randomUUID(), subjectId, email, driverId]);
    await pool.query(`
      INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,created_at,expires_at)
      VALUES($1,$2,'passenger',$3,now(),now() + interval '1 hour')
    `, [sessionId, subjectId, randomUUID()]);
    await assert.rejects(store.remove({ role, subjectId, actor }), { code: 'ACCOUNT_SESSION_RECENT' });
    await pool.query("UPDATE auth_sessions SET created_at=now()-interval '1 hour', expires_at=now()-interval '11 minutes' WHERE id=$1", [sessionId]);
    await pool.query("INSERT INTO ledger_transactions(id,kind,reference_key) VALUES($1,'test',$2)", [ledgerId, subjectId]);
    await pool.query(`
      INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents) VALUES($1,$2,'credit',100)
    `, [ledgerId, `passenger:${subjectId}:wallet`]);
    await assert.rejects(store.remove({ role, subjectId, actor }), { code: 'ACCOUNT_FINANCIAL_HISTORY' });
    assert.equal((await pool.query('SELECT 1 FROM ledger_entries WHERE transaction_id=$1', [ledgerId])).rowCount, 1);
    await pool.query('DELETE FROM ledger_entries WHERE transaction_id=$1', [ledgerId]);
    await store.remove({ role, subjectId, actor });
    const identities = await pool.query('SELECT id FROM auth_identities WHERE subject_id=$1', [subjectId]);
    assert.deepEqual(identities.rows, [{ id: driverId }]);
    assert.equal((await pool.query('SELECT 1 FROM auth_sessions WHERE id=$1', [sessionId])).rowCount, 0);
    await store.remove({ role: 'driver', subjectId, actor });
    assert.equal((await pool.query("SELECT 1 FROM admin_audit_log WHERE actor_user_id=$1 AND action='account.deleted'", [actor.id])).rowCount, 2);
    await assert.rejects(store.remove({ role, subjectId, actor }), { code: 'ACCOUNT_NOT_FOUND' });
  } finally {
    try {
      await pool.query('DELETE FROM admin_audit_log WHERE actor_user_id=$1', [actor.id]);
      await pool.query('DELETE FROM auth_sessions WHERE id=$1', [sessionId]);
      await pool.query('DELETE FROM auth_identities WHERE subject_id=$1', [subjectId]);
      await pool.query('DELETE FROM ledger_entries WHERE transaction_id=$1', [ledgerId]);
      await pool.query('DELETE FROM ledger_transactions WHERE id=$1', [ledgerId]);
      await pool.query('DELETE FROM admin_users WHERE id=$1', [actor.id]);
    } finally {
      await pool.end();
    }
  }
});
