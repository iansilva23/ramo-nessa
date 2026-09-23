import { Pool } from 'pg';

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: true }
        : undefined,
  });
}
