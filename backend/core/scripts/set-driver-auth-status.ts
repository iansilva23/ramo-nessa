import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import type { AuthIdentityStatus } from '../src/auth/auth-otp-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
  if (!value) {
    console.error(`Uso: npm run auth:set-driver-status -- --driver-id=<id> --status=active|suspended`);
    process.exit(2);
  }
  return value;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL é obrigatório.');
  process.exit(2);
}

const driverId = requiredArg('driver-id');
const rawStatus = requiredArg('status');
if (rawStatus !== 'active' && rawStatus !== 'suspended') {
  console.error('status deve ser active ou suspended.');
  process.exit(2);
}
const status: AuthIdentityStatus = rawStatus;

const pool = createPostgresPool(databaseUrl);
const repository = new PostgresAuthOtpRepository(pool);

try {
  const identity = await repository.setIdentityStatus({
    subjectType: 'driver',
    subjectId: driverId,
    status,
    updatedAt: new Date().toISOString(),
  });

  if (identity == null) {
    console.error('Identidade do motorista não encontrada.');
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify(
        {
          ok: true,
          driverId: identity.subjectId,
          phoneE164: identity.phoneE164,
          status: identity.status,
          updatedAt: identity.updatedAt,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await pool.end();
}
