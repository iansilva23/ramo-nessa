import type { AdminScope } from '../src/admin/admin-repository.js';
import { ADMIN_SCOPES } from '../src/admin/admin-repository.js';
import {
  createAdminHumanUser,
} from '../src/admin/admin-human-auth-service.js';
import {
  resolveAdminMfaEncryptionKey,
} from '../src/admin/admin-human-crypto.js';
import { PostgresAdminHumanAuthRepository } from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function optionalArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function requiredArg(name: string): string {
  const value = optionalArg(name);
  if (!value) {
    console.error(
      'Uso: npm run admin:create-user -- --name=<nome> --email=<email> ' +
        '[--scopes=drivers:auth:read,drivers:auth:write,audit:read]',
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
const email = requiredArg('email');
const rawScopes = optionalArg('scopes');
const scopes: AdminScope[] =
  rawScopes == null
    ? [...ADMIN_SCOPES]
    : rawScopes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as AdminScope[];

const pool = createPostgresPool(databaseUrl);
const repository = new PostgresAdminHumanAuthRepository(pool);

try {
  const created = await createAdminHumanUser({
    repository,
    name,
    email,
    scopes,
    encryptionKey: resolveAdminMfaEncryptionKey(),
  });

  console.log(
    JSON.stringify(
      {
        userId: created.user.id,
        name: created.user.name,
        email: created.user.emailNormalized,
        scopes: created.user.scopes,
        initialPassword: created.initialPassword,
        totpSecret: created.totpSecretBase32,
        otpauthUri: created.otpauthUri,
        warning:
          'Senha e segredo TOTP são exibidos somente neste bootstrap. Guarde-os em local seguro.',
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
