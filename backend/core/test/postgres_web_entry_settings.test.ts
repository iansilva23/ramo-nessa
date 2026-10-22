import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresWebEntrySettingsRepository} from '../src/config/web-entry-settings.js';
const url=process.env.DATABASE_URL;
const allowed=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&url==='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
test('PostgreSQL: durable entry switch, concurrent revision, atomic audit, additive migration without operational reset',{skip:!allowed},async()=>{
  const root=createPostgresPool(url!),schema='entry_'+randomUUID().replaceAll('-','');
  const target=new URL(url!);target.searchParams.set('options','-c search_path='+schema+',public');const pool=createPostgresPool(target.toString());
  const actor={kind:'user' as const,id:randomUUID(),name:'Synthetic entry admin'};
  try{
    await root.query('CREATE SCHEMA '+schema);
    for(const table of ['operational_settings','admin_audit_log'])await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
    await pool.query('INSERT INTO operational_settings SELECT * FROM public.operational_settings');
    await pool.query('ALTER TABLE operational_settings DROP COLUMN web_entry_gate_enabled,DROP COLUMN web_entry_gate_revision,DROP COLUMN web_entry_gate_updated_at');
    const before=(await pool.query('SELECT to_jsonb(s) AS value FROM operational_settings s WHERE id=1')).rows[0].value;
    const migration=readFileSync(new URL('../migrations/087_web_entry_gate_settings.sql',import.meta.url),'utf8');
    await pool.query(migration);await pool.query(migration);
    const repo=new PostgresWebEntrySettingsRepository(pool);assert.equal((await repo.get()).enabled,false);
    const saved=await repo.save({enabled:true,expectedRevision:0,actor});assert.equal(saved.enabled,true);
    assert.deepEqual(await new PostgresWebEntrySettingsRepository(pool).get(),saved);
    await pool.query(migration);assert.equal((await repo.get()).enabled,true,'reapplying migration does not reset selection');
    const outcomes=await Promise.allSettled([repo.save({enabled:false,expectedRevision:1,actor}),repo.save({enabled:false,expectedRevision:1,actor})]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
    assert.equal(Number((await pool.query("SELECT count(*) n FROM admin_audit_log WHERE action='web_entry_settings.updated'")).rows[0].n),2);
    await pool.query("CREATE FUNCTION fail_entry_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER fail_entry_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION fail_entry_audit()");
    await assert.rejects(repo.save({enabled:true,expectedRevision:2,actor}),/synthetic audit failure/);
    assert.equal((await repo.get()).enabled,false);assert.equal((await repo.get()).revision,2);
    const after=(await pool.query('SELECT to_jsonb(s) AS value FROM operational_settings s WHERE id=1')).rows[0].value;
    for(const key of ['web_entry_gate_enabled','web_entry_gate_revision','web_entry_gate_updated_at']){delete before[key];delete after[key];}
    assert.deepEqual(after,before,'GPS, payment keys, hold/search times and operational settings unchanged');
  }finally{await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();}
});
