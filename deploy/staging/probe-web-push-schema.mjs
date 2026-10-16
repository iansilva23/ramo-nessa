// Runs only in a disposable container sharing the network-none database namespace.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
const require = createRequire('/app/package.json');
const { Pool } = require('pg');
const { PostgresPushDeviceRepository } = await import('/app/dist/src/notifications/repositories/postgres-push-device-repository.js');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repo = new PostgresPushDeviceRepository(pool);
const modern = process.argv.includes('--modern');
const sessionId = randomUUID(), subjectId = 'isolated-web-' + randomUUID();
const at = new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  await pool.query(`INSERT INTO auth_sessions
    (id,subject_id,subject_type,token_hash,expires_at,created_at)
    VALUES ($1,$2,'passenger',$3,NOW()+INTERVAL '1 hour',NOW())`,
    [sessionId, subjectId, hash(sessionId)]);
  for (const platform of modern ? ['android', 'ios', 'web'] : ['android', 'ios']) {
    const token = 'isolated-' + randomUUID();
    const input = { id: randomUUID(), sessionId, subjectId, subjectType: 'passenger',
      platform, provider: 'fcm', token, tokenHash: hash(token),
      createdAt: at, updatedAt: at, appVersion: '1.0.0', buildNumber: 1,
      ...(platform === 'web' ? { notificationPreference: 'important' } : {}) };
    const device = await repo.registerForSession(input);
    assert.equal(device.platform, platform);
    const stored = await pool.query('SELECT notification_preference FROM push_devices WHERE id=$1', [device.id]);
    assert.equal(stored.rows[0].notification_preference, platform === 'web' ? 'important' : 'all');
    if (modern) assert.equal(device.notificationPreference, stored.rows[0].notification_preference);
    if (platform === 'web') {
      await assert.rejects(pool.query("UPDATE push_devices SET provider='apns' WHERE id=$1", [device.id]),
        error => error.code === '23514');
      await assert.rejects(pool.query("UPDATE push_devices SET notification_preference='invalid' WHERE id=$1", [device.id]),
        error => error.code === '23514');
    }
    const enabled = await repo.listEnabledForSubject('passenger', subjectId);
    assert.equal(enabled.length, 1);
    assert.equal(enabled[0].id, device.id);
    await repo.markUpdateNotified(device.id, 2, at);
    await repo.disableDevice(device.id, at);
    assert.equal((await repo.listEnabledForSubject('passenger', subjectId)).length, 0);
  }
  console.log(modern ? 'NEW_REPOSITORY_OK' : 'OLD_REPOSITORY_OK');
} finally {
  await pool.query('DELETE FROM auth_sessions WHERE id=$1', [sessionId]);
  await pool.end();
}
