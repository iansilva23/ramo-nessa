import { randomBytes } from 'node:crypto';
import { access, chmod, writeFile } from 'node:fs/promises';

function secretHex(bytes = 32) { return randomBytes(bytes).toString('hex'); }
function secretBase64(bytes = 32) { return randomBytes(bytes).toString('base64'); }
function secretBase64Url(bytes = 32) { return randomBytes(bytes).toString('base64url'); }

export function buildStagingEnvironment() {
  const postgresPassword = secretBase64Url(32);
  return [
    '# Ramo Nessa — homologação',
    '# Gerado no host. Nunca versionar.',
    '',
    'APP_DOMAIN=CHANGE_ME',
    'ACME_EMAIL=CHANGE_ME',
    '',
    'POSTGRES_USER=ramonessa',
    'POSTGRES_DB=ramonessa',
    'POSTGRES_PASSWORD=' + postgresPassword,
    'DATABASE_URL=postgresql://ramonessa:' + postgresPassword + '@postgres:5432/ramonessa',
    'DB_POOL_MAX=20',
    'SHUTDOWN_TIMEOUT_MS=10000',
    '',
    'OTP_HASH_SECRET=' + secretHex(32),
    'OTP_RATE_LIMIT_SECRET=' + secretHex(32),
    'ADMIN_MFA_ENCRYPTION_KEY=' + secretBase64(32),
    'ADMIN_LOGIN_RATE_LIMIT_SECRET=' + secretHex(32),
    'ADMIN_OWNER_USER_ID=',
    'ADMIN_PAYOUT_APPROVER_USER_ID=',
    '',
    'ROUTING_TIMEOUT_MS=5000',
    'PLACE_PROOF_SECRET=' + secretHex(32),
    'PLACE_PROOF_TTL_SECONDS=1800',
    'DOCUMENT_INSPECTION_ENCRYPTION_KEY=' + secretBase64(32),
    'DOCUMENT_INSPECTION_TTL_SECONDS=60',
    '',
    'MERCADO_PAGO_ACCESS_TOKEN_TEST=',
    'MERCADO_PAGO_WEBHOOK_SECRET=',
    '',
  ].join('\n');
}

export async function ensureStagingEnvironment(filePath, { force = false } = {}) {
  if (!force) {
    try {
      await access(filePath);
      await chmod(filePath, 0o600);
      return { created: false, filePath };
    } catch {}
  }
  await writeFile(filePath, buildStagingEnvironment(), { encoding: 'utf8', mode: 0o600 });
  return { created: true, filePath };
}
