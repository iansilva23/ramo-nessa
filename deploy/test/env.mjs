import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';

function secretHex(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function secretBase64Url(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function buildTestEnvironment({ port = 8080 } = {}) {
  const postgresPassword = secretBase64Url(24);
  const databaseUrl =
    'postgresql://ramonessa:' +
    postgresPassword +
    '@postgres:5432/ramonessa';

  return [
    `TEST_HTTP_PORT=${port}`,
    `POSTGRES_PASSWORD=${postgresPassword}`,
    `DATABASE_URL=${databaseUrl}`,
    `OTP_HASH_SECRET=${secretHex(32)}`,
    `OTP_RATE_LIMIT_SECRET=${secretHex(32)}`,
    `ADMIN_MFA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
    `ADMIN_LOGIN_RATE_LIMIT_SECRET=${secretHex(32)}`,
    `DOCUMENT_STORAGE_AUTH_TOKEN=${secretBase64Url(32)}`,
    `DOCUMENT_INSPECTION_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
    '',
  ].join('\n');
}

export async function ensureTestEnvironment(
  filePath,
  { force = false, port = 8080 } = {},
) {
  if (!force) {
    try {
      await access(filePath);
      return { created: false, filePath };
    } catch {}
  }

  await writeFile(filePath, buildTestEnvironment({ port }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return { created: true, filePath };
}
