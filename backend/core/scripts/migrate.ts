import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresPool } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL é obrigatório para executar migrations.');
}

const pool = createPostgresPool(databaseUrl);
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );
    if (applied.rowCount != null && applied.rowCount > 0) {
      console.log(`skip ${filename}`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
