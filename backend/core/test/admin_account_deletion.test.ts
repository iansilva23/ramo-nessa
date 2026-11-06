import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresAdminAccountDeletion } from '../src/admin/admin-account-deletion.js';

test('owner deletion removes the requested account immediately while retaining financial and support history', {
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
  const ticket = randomUUID();
  const oldPassengerId = randomUUID();
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
    `, [oldPassengerId, subjectId, email, driverId]);
    await pool.query(`
      INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,created_at,expires_at)
      VALUES($1,$2,'passenger',$3,now(),now() + interval '1 hour')
    `, [sessionId, subjectId, randomUUID()]);
    await pool.query(`
      INSERT INTO driver_support_tickets(id,passenger_id,category,subject,message,status,created_at,updated_at)
      VALUES($1,$2,'account','A conta','Mensagem de suporte de teste','open',now(),now())
    `, [ticket, subjectId]);
    await pool.query(`
      INSERT INTO driver_supply(driver_id,vehicle_id,categories,seat_capacity,online,latitude,longitude,location_updated_at)
      VALUES($1,'fixture',ARRAY['car'],4,true,0,0,now())
    `, [subjectId]);
    await pool.query("INSERT INTO ledger_transactions(id,kind,reference_key) VALUES($1,'test',$2)", [ledgerId, subjectId]);
    await pool.query(`
      INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents) VALUES($1,$2,'credit',100)
    `, [ledgerId, `passenger:${subjectId}:wallet`]);
    assert.deepEqual(await store.remove({ role, subjectId, actor }), [sessionId]);
    assert.equal((await pool.query('SELECT 1 FROM ledger_entries WHERE transaction_id=$1', [ledgerId])).rowCount, 1);
    assert.equal((await pool.query('SELECT 1 FROM driver_support_tickets WHERE id=$1', [ticket])).rowCount, 1);
    const identities = await pool.query('SELECT id FROM auth_identities WHERE subject_id=$1', [subjectId]);
    assert.deepEqual(identities.rows, [{ id: driverId }]);
    assert.equal((await pool.query('SELECT 1 FROM auth_sessions WHERE id=$1', [sessionId])).rowCount, 0);
    await assert.rejects(pool.query(`
      INSERT INTO auth_identities(id,subject_type,subject_id,phone_e164,email_normalized,status,created_at,updated_at)
      VALUES ($1,'passenger',$2,'+5588999912340',$3,'active',now(),now())
    `, [oldPassengerId, subjectId, email]), { code: '23503' });
    await pool.query(`
      INSERT INTO auth_identities(id,subject_type,subject_id,phone_e164,email_normalized,status,created_at,updated_at)
      VALUES ($1,'passenger',$2,'+5588999912340',$3,'active',now(),now())
    `, [randomUUID(), subjectId + '-new', email]);
    await store.remove({ role: 'driver', subjectId, actor });
    assert.deepEqual((await pool.query('SELECT online FROM driver_supply WHERE driver_id=$1', [subjectId])).rows, [{ online: false }]);
    await assert.rejects(pool.query('UPDATE driver_supply SET online=true WHERE driver_id=$1', [subjectId]), { code: '23503' });
    assert.equal((await pool.query("SELECT 1 FROM admin_audit_log WHERE actor_user_id=$1 AND action='account.deleted'", [actor.id])).rowCount, 2);
    await assert.rejects(store.remove({ role, subjectId, actor }), { code: 'ACCOUNT_NOT_FOUND' });
  } finally {
    try {
      await pool.query('DELETE FROM admin_audit_log WHERE actor_user_id=$1', [actor.id]);
      await pool.query('DELETE FROM auth_sessions WHERE id=$1', [sessionId]);
      await pool.query('DELETE FROM driver_support_tickets WHERE id=$1', [ticket]);
      await pool.query('DELETE FROM driver_supply WHERE driver_id=$1', [subjectId]);
      await pool.query('DELETE FROM auth_identities WHERE subject_id IN ($1,$2)', [subjectId, subjectId + '-new']);
      await pool.query('DELETE FROM ledger_entries WHERE transaction_id=$1', [ledgerId]);
      await pool.query('DELETE FROM ledger_transactions WHERE id=$1', [ledgerId]);
      await pool.query('DELETE FROM admin_users WHERE id=$1', [actor.id]);
    } finally {
      await pool.end();
    }
  }
});
