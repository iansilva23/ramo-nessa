import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresPushDeviceRepository } from '../src/notifications/repositories/postgres-push-device-repository.js';
import { registerPushDevice } from '../src/notifications/push-notification-service.js';

// Somente banco descartável explicitamente fornecido a este teste.
const databaseUrl = process.env.RAMO_PUSH_TEST_DATABASE_URL?.trim();
test('PostgreSQL: migration idempotente, preferência persistida e sessão ativa obrigatória', { skip: !databaseUrl }, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = 'push_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  try {
    for (const name of ['013_auth_sessions', '036_push_devices', '057_push_devices_fcm']) {
      await pool.query(await readFile(new URL('../migrations/' + name + '.sql', import.meta.url), 'utf8'));
    }
    const communications = await readFile(new URL('../migrations/037_admin_communications.sql', import.meta.url), 'utf8');
    await pool.query(communications.slice(0, communications.indexOf('CREATE TABLE IF NOT EXISTS admin_notification_campaigns')));
    const session = { id: randomUUID(), subjectId: 'postgres-web-user', subjectType: 'passenger' as const,
      tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: new Date().toISOString() };
    await pool.query('INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [session.id, session.subjectId, session.subjectType, session.tokenHash, session.expiresAt, session.createdAt]);
    const legacyId = randomUUID();
    await pool.query(`INSERT INTO push_devices(id,session_id,subject_id,subject_type,platform,provider,token,token_hash,created_at,updated_at,build_number)
      VALUES($1,$2,$3,'passenger','android','fcm','legacy-token-aaaaaaaaaaaaaaaaaaaa','legacy-hash',$4,$4,1)`,
      [legacyId, session.id, session.subjectId, session.createdAt]);
    const migration = await readFile(new URL('../migrations/085_web_push_preferences.sql', import.meta.url), 'utf8');
    await pool.query(migration); await pool.query(migration);
    const repo = new PostgresPushDeviceRepository(pool);
    const legacy = (await repo.listEnabledForSubject('passenger', session.subjectId))[0]!;
    assert.equal(legacy.id, legacyId); assert.equal(legacy.notificationPreference, 'all');
    const request = { platform: 'web' as const, provider: 'fcm' as const, token: 'web-token-aaaaaaaaaaaaaaaaaaaaaaa', notificationPreference: 'important' as const };
    const nextSession = { ...session, id: randomUUID(), tokenHash: randomUUID() };
    await pool.query('INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [nextSession.id, nextSession.subjectId, nextSession.subjectType, nextSession.tokenHash, nextSession.expiresAt, nextSession.createdAt]);
    const device = await registerPushDevice({ repository: repo, session: nextSession, registration: request });
    assert.equal(device.notificationPreference, 'important');
    assert.ok(Number.isFinite(Date.parse(device.createdAt)));
    assert.equal(device.createdAt, device.updatedAt);
    await registerPushDevice({ repository: repo, session: nextSession, registration: { ...request, notificationPreference: 'all' } });
    const { notificationPreference: _preference, ...oldClient } = request;
    await registerPushDevice({ repository: repo, session: nextSession, registration: oldClient });
    assert.equal((await repo.listEnabledForSubject('passenger', session.subjectId)).find(d => d.id === device.id)?.notificationPreference, 'all');
    assert.equal((await repo.listEnabledByAudience('all')).length, 2);
    assert.equal((await repo.listEnabledOutdated('passenger', 'android', 2)).length, 1);
    await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1', [nextSession.id]);
    assert.equal((await repo.listEnabledByAudience('all')).length, 1);
    await pool.query("UPDATE auth_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [session.id]);
    assert.equal((await repo.listEnabledForSubject('passenger', session.subjectId)).length, 0);
    assert.equal((await repo.listEnabledOutdated('passenger', 'android', 2)).length, 0);
    await pool.query("UPDATE auth_sessions SET revoked_at=NULL,expires_at=NOW()+INTERVAL '1 hour' WHERE id=$1", [nextSession.id]);
    assert.equal((await repo.listEnabledByAudience('passenger')).length, 1);
    await assert.rejects(() => pool.query("UPDATE push_devices SET provider='apns' WHERE id=$1", [device.id]), /push_devices_web_provider_check/);
    await repo.disableForSession(nextSession.id, new Date().toISOString());
    assert.equal((await repo.listEnabledByAudience('all')).length, 0);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
