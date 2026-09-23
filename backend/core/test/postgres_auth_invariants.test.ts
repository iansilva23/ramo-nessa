import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthenticationError, authenticateBearer, hashBearerToken, issueAuthSession } from '../src/auth/auth-service.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL persiste somente hash do token e respeita revogação',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresAuthSessionRepository(pool);
    const now = new Date('2026-09-23T09:45:00.000Z');

    try {
      const issued = await issueAuthSession({
        repository,
        subjectId: 'postgres-passenger-auth',
        subjectType: 'passenger',
        now,
        ttlMs: 120_000,
      });

      const row = await pool.query<{
        token_hash: string;
        subject_id: string;
        subject_type: string;
      }>(
        `
        SELECT token_hash, subject_id, subject_type
        FROM auth_sessions
        WHERE id = $1
        `,
        [issued.session.id],
      );

      assert.equal(row.rows[0]?.subject_id, 'postgres-passenger-auth');
      assert.equal(row.rows[0]?.subject_type, 'passenger');
      assert.equal(row.rows[0]?.token_hash, hashBearerToken(issued.token));
      assert.notEqual(row.rows[0]?.token_hash, issued.token);

      const authenticated = await authenticateBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredType: 'passenger',
        now: new Date('2026-09-23T09:45:30.000Z'),
      });
      assert.equal(authenticated.id, issued.session.id);

      await repository.revoke(
        issued.session.id,
        '2026-09-23T09:45:40.000Z',
      );

      await assert.rejects(
        () =>
          authenticateBearer({
            repository,
            headers: { authorization: `Bearer ${issued.token}` },
            requiredType: 'passenger',
            now: new Date('2026-09-23T09:45:50.000Z'),
          }),
        (error: unknown) =>
          error instanceof AuthenticationError &&
          error.code === 'AUTH_INVALID',
      );
    } finally {
      await pool.query(
        `DELETE FROM auth_sessions WHERE subject_id = $1`,
        ['postgres-passenger-auth'],
      );
      await pool.end();
    }
  },
);
