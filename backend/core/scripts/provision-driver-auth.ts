import { randomUUID } from 'node:crypto';

import { normalizeBrazilMobilePhone } from '../src/auth/phone-otp-service.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const [driverIdRaw, phoneRaw] = process.argv.slice(2);
const driverId = driverIdRaw?.trim();

if (!driverId || driverId.length < 3 || !phoneRaw) {
  console.error(
    'Uso: npm run auth:provision-driver -- <driverId> <celular>',
  );
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL é obrigatório.');
}

const phoneE164 = normalizeBrazilMobilePhone(phoneRaw);
const pool = createPostgresPool(databaseUrl);
const repository = new PostgresAuthOtpRepository(pool);

try {
  const [byPhone, bySubject] = await Promise.all([
    repository.findIdentityByPhone('driver', phoneE164),
    repository.findIdentityBySubject('driver', driverId),
  ]);

  if (byPhone != null && byPhone.subjectId !== driverId) {
    throw new Error(
      'Este telefone já está vinculado a outro motorista.',
    );
  }

  if (bySubject != null && bySubject.phoneE164 !== phoneE164) {
    throw new Error(
      'Este motorista já está vinculado a outro telefone.',
    );
  }

  const existing = byPhone ?? bySubject;
  if (existing != null) {
    console.log(
      JSON.stringify(
        {
          status: 'already_provisioned',
          driverId: existing.subjectId,
          phoneE164: existing.phoneE164,
        },
        null,
        2,
      ),
    );
    process.exitCode = 0;
  } else {
    const now = new Date().toISOString();
    const identity = await repository.createIdentity({
      id: randomUUID(),
      subjectId: driverId,
      subjectType: 'driver',
      phoneE164,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    console.log(
      JSON.stringify(
        {
          status: 'provisioned',
          driverId: identity.subjectId,
          phoneE164: identity.phoneE164,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await pool.end();
}
