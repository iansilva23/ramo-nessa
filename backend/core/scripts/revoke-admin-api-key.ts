import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();

  if (!value) {
    console.error(
      'Uso: npm run admin:revoke-key -- --key-id=<uuid>',
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

const keyId = requiredArg('key-id');
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    keyId,
  )
) {
  console.error('key-id deve ser um UUID válido.');
  process.exit(2);
}

const pool = createPostgresPool(databaseUrl);
const repository = new PostgresAdminRepository(pool);

try {
  const revoked = await repository.revokeApiKey(
    keyId,
    new Date().toISOString(),
  );
  if (!revoked) {
    console.error('Chave administrativa não encontrada.');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, keyId }, null, 2));
  }
} finally {
  await pool.end();
}
