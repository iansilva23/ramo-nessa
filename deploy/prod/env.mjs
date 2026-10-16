import { randomBytes } from 'node:crypto';
import { access, chmod, writeFile } from 'node:fs/promises';

function secretHex(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function secretBase64(bytes = 32) {
  return randomBytes(bytes).toString('base64');
}

function secretBase64Url(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function buildProductionEnvironment() {
  const postgresPassword = secretBase64Url(32);
  const databaseUrl =
    'postgresql://ramonessa:' +
    postgresPassword +
    '@postgres:5432/ramonessa';

  return [
    '# Ramo Nessa — produção',
    '# Gerado localmente. Nunca versionar este arquivo.',
    '',
    'APP_DOMAIN=CHANGE_ME',
    'ACME_EMAIL=CHANGE_ME',
    '',
    'POSTGRES_USER=ramonessa',
    'POSTGRES_DB=ramonessa',
    'POSTGRES_PASSWORD=' + postgresPassword,
    'DATABASE_URL=' + databaseUrl,
    'DB_POOL_MAX=20',
    'DB_SSL=false',
    'DB_SSL_CA=',
    '',
    'SHUTDOWN_TIMEOUT_MS=10000',
    '',
    'OTP_HASH_SECRET=' + secretHex(32),
    'OTP_RATE_LIMIT_SECRET=' + secretHex(32),
    'OTP_PROVIDER=webhook',
    'ENTRAR_API_SECRET=',
    'OTP_WEBHOOK_URL=CHANGE_ME',
    'OTP_WEBHOOK_TOKEN=CHANGE_ME',
    '',
    'ADMIN_MFA_ENCRYPTION_KEY=' + secretBase64(32),
    'ADMIN_LOGIN_RATE_LIMIT_SECRET=' + secretHex(32),
    'ADMIN_OWNER_USER_ID=',
    'ADMIN_PAYOUT_APPROVER_USER_ID=',
    '',
    'ROUTING_TIMEOUT_MS=5000',
    'GOOGLE_MAPS_SERVER_API_KEY=CHANGE_ME',
    'PLACE_PROOF_SECRET=' + secretHex(32),
    'PLACE_PROOF_TTL_SECONDS=1800',
    '',
    'PUSH_PROVIDER=fcm',
    'FIREBASE_SERVICE_ACCOUNT_HOST_FILE=./secrets/firebase-service-account.json',
    '',
    'DOCUMENT_INSPECTION_ENCRYPTION_KEY=' + secretBase64(32),
    'DOCUMENT_INSPECTION_TTL_SECONDS=60',
    '',
    'MERCADO_PAGO_ACCESS_TOKEN=CHANGE_ME',
    'MERCADO_PAGO_WEBHOOK_SECRET=CHANGE_ME',
    '',
    'DRIVER_PAYOUT_PROVIDER_NAME=',
    'MERCADO_PAGO_PAYOUT_MODE=production',
    'MERCADO_PAGO_PAYOUT_ACCESS_TOKEN=',
    'MERCADO_PAGO_PAYOUT_PRIVATE_KEY_BASE64=',
    'DRIVER_PAYOUT_PROVIDER_URL=',
    'DRIVER_PAYOUT_PROVIDER_TOKEN=',
    'DRIVER_PAYOUT_RECONCILE_INTERVAL_SECONDS=60',
    '',
  ].join('\n');
}

export async function ensureProductionEnvironment(
  filePath,
  { force = false } = {},
) {
  if (!force) {
    try {
      await access(filePath);
      await chmod(filePath, 0o600);
      return { created: false, filePath };
    } catch {}
  }

  await writeFile(filePath, buildProductionEnvironment(), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return { created: true, filePath };
}
