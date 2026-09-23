import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresPool } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL é obrigatório para executar migrations.');
}

const pool = createPostgresPool(databaseUrl);
const client = await pool.connect();
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const migrationLockKey = 'ramo-nessa-schema-migrations';

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

try {
  await client.query(
    'SELECT pg_advisory_lock(hashtextextended($1, 0))',
    [migrationLockKey],
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(
    'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text',
  );

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const sql = await readFile(join(migrationsDir, filename), 'utf8');
    const sqlChecksum = checksum(sql);
    const applied = await client.query<{ checksum: string | null }>(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename],
    );
    const appliedRow = applied.rows[0];

    if (appliedRow != null) {
      if (appliedRow.checksum == null) {
        // Compatibilidade com bancos criados antes da auditoria de checksums.
        await client.query(
          'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1',
          [filename, sqlChecksum],
        );
      } else if (appliedRow.checksum !== sqlChecksum) {
        throw new Error(
          `Migration ${filename} foi alterada depois de aplicada. ` +
            'Crie uma nova migration em vez de editar o histórico.',
        );
      }

      console.log(`skip ${filename}`);
      continue;
    }

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, sqlChecksum],
      );
      await client.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  try {
    await client.query(
      'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
      [migrationLockKey],
    );
  } finally {
    client.release();
    await pool.end();
  }
}
