import { Pool } from 'pg';

import { resolveDbPoolMax } from '../config/runtime-config.js';

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: resolveDbPoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized: true,
            ...(process.env.DB_SSL_CA?.trim()
              ? { ca: process.env.DB_SSL_CA }
              : {}),
          }
        : undefined,
  });
}
