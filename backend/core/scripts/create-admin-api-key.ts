import type { AdminScope } from '../src/admin/admin-repository.js';
import { ADMIN_SCOPES } from '../src/admin/admin-repository.js';
import { issueAdminApiKey } from '../src/admin/admin-auth.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function optionalArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function requiredArg(name: string): string {
  const value = optionalArg(name);
  if (!value) {
    console.error(
      'Uso: npm run admin:create-key -- --name=<nome> ' +
        '[--scopes=drivers:auth:read,drivers:auth:write,audit:read] ' +
        '[--days=90]',
    );
    process.exit(2);
  }
  return value;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL é obrigatório.');
  process.exit(2);
}

const name = requiredArg('name');
const rawScopes = optionalArg('scopes');
const rawDays = Number(optionalArg('days') ?? '90');
if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > 365) {
  console.error('--days deve ser inteiro entre 1 e 365.');
  process.exit(2);
}
const scopes: AdminScope[] =
  rawScopes == null
    ? [...ADMIN_SCOPES]
    : rawScopes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as AdminScope[];

const pool = createPostgresPool(databaseUrl);
const repository = new PostgresAdminRepository(pool);

try {
  const issued = await issueAdminApiKey({
    repository,
    name,
    scopes,
    ttlMs: rawDays * 24 * 60 * 60 * 1000,
  });

  console.log(
    JSON.stringify(
      {
        keyId: issued.key.id,
        name: issued.key.name,
        scopes: issued.key.scopes,
        token: issued.token,
        createdAt: issued.key.createdAt,
        expiresAt: issued.key.expiresAt,
        warning:
          'Copie o token agora. O Core persiste somente o hash e não poderá exibi-lo novamente.',
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
