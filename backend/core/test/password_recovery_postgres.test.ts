import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresPasswordRecoveryStore } from '../src/auth/password-recovery-store.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';

test('PostgreSQL bounds recovery sends and commits one password change with session revocation', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new PostgresPasswordRecoveryStore(pool);
  const sessions = new PostgresAuthSessionRepository(pool);
  const identity = randomUUID();
  const subject = 'recovery-' + identity;
  const bucket = 'recovery-test-' + identity;
  const challenge = {
    id: randomUUID(), identity_id: identity, channel: 'email' as const, session_id: null,
    destination_hash: 'confirmed-contact', credential_hash: 'old-credential',
  };

  try {
    await pool.query(`
      INSERT INTO auth_identities
        (id, subject_id, subject_type, phone_e164, email_normalized, password_hash, status, created_at, updated_at)
      VALUES ($1, $2, 'passenger', '+5588999900123', 'recovery-ci@example.test', 'old-password-hash', 'active', now(), now())
    `, [identity, subject]);
    const session = {
      id: randomUUID(), subjectId: subject, subjectType: 'passenger' as const, tokenHash: randomUUID(),
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    assert.equal(await sessions.createForPassengerPassword(session, 'old-password-hash'), true);
    await pool.query(`
      INSERT INTO auth_recovery_contacts(identity_id, channel, destination_hash)
      VALUES ($1, 'email', $2)
    `, [identity, challenge.destination_hash]);
    await store.create(challenge);
    await store.setProof(challenge.id, 'proof');
    const claims = await Promise.all([
      store.claim(challenge.id, 'passenger', null),
      store.claim(challenge.id, 'passenger', null),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claimed = claims.find(Boolean);
    assert.ok(claimed);
    assert.equal(await store.finish({
      challenge: claimed, role: 'passenger', password: 'new-password-hash',
      isCurrent: account => account.password === 'old-password-hash',
    }), true);
    assert.equal(await store.claim(challenge.id, 'passenger', null), undefined);
    assert.ok((await sessions.findByTokenHash(session.tokenHash))?.revokedAt);
    assert.equal(await sessions.createForPassengerPassword(
      { ...session, id: randomUUID(), tokenHash: randomUUID() }, 'old-password-hash',
    ), false);
    await pool.query("UPDATE auth_identities SET email_normalized = 'changed-ci@example.test' WHERE id = $1", [identity]);
    assert.equal(await store.confirmed(identity, 'email', challenge.destination_hash), false);
    await store.create(challenge);
    await store.setProof(challenge.id, 'proof');
    await pool.query("UPDATE auth_recovery_challenges SET expires_at = now() - interval '1 second' WHERE id = $1", [challenge.id]);
    assert.equal(await store.claim(challenge.id, 'passenger', null), undefined);

    const rules = [{ key: bucket, limit: 3, windowMs: 900_000 }];
    const concurrent = await Promise.all(Array.from({ length: 7 }, () => store.takeLimit(rules)));
    assert.equal(concurrent.filter(result => result.allowed).length, 3);
    const blocked = concurrent.find(result => !result.allowed);
    assert.ok(blocked && blocked.retryAfterMs > 0);
  } finally {
    try {
      await pool.query('DELETE FROM auth_identities WHERE id = $1', [identity]);
      await pool.query('DELETE FROM auth_sessions WHERE subject_id = $1', [subject]);
      await pool.query('DELETE FROM auth_recovery_rate_limits WHERE bucket_key = $1', [bucket]);
    } finally {
      await pool.end();
    }
  }
});
