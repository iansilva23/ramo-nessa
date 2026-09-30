import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) {
      throw new Error('Linha inválida no .env: ' + line);
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (values.has(key)) {
      throw new Error('Variável duplicada no .env: ' + key);
    }
    values.set(key, value);
  }
  return values;
}

function requireValue(env, key, minLength = 1) {
  const value = env.get(key) ?? '';
  if (
    value.length < minLength ||
    value === 'CHANGE_ME' ||
    value.startsWith('REPLACE_WITH_')
  ) {
    throw new Error(key + ' precisa ser configurada.');
  }
  return value;
}

function requireInteger(env, key, min, max) {
  const value = Number(requireValue(env, key));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      key + ' deve ser inteiro entre ' + min + ' e ' + max + '.',
    );
  }
  return value;
}

function assertBase64Bytes(value, bytes, key) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== bytes) {
    throw new Error(
      key + ' deve conter exatamente ' + bytes + ' bytes em base64.',
    );
  }
}

function assertHttps(value, key) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(key + ' precisa ser uma URL válida.');
  }
  if (url.protocol !== 'https:') {
    throw new Error(key + ' precisa usar HTTPS.');
  }
}

async function validateFirebaseServiceAccountFile(filePath) {
  let raw;
  let info;
  try {
    [raw, info] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ]);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_HOST_FILE não pôde ser lido.',
    );
  }

  if (!info.isFile()) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_HOST_FILE precisa apontar para um arquivo.',
    );
  }

  if ((info.mode & 0o077) !== 0) {
    throw new Error(
      'Service Account Firebase deve ter permissão 0600 ou mais restritiva.',
    );
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'Service Account Firebase não contém JSON válido.',
    );
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Service Account Firebase possui formato inválido.');
  }

  const projectId =
    typeof value.project_id === 'string'
      ? value.project_id.trim()
      : '';
  const clientEmail =
    typeof value.client_email === 'string'
      ? value.client_email.trim()
      : '';
  const privateKey =
    typeof value.private_key === 'string'
      ? value.private_key.trim()
      : '';
  const type =
    typeof value.type === 'string'
      ? value.type.trim()
      : '';

  if (
    type !== 'service_account' ||
    projectId.length < 3 ||
    clientEmail.length < 6 ||
    !clientEmail.includes('@') ||
    !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
    !privateKey.includes('-----END PRIVATE KEY-----')
  ) {
    throw new Error(
      'Service Account Firebase precisa de type=service_account, project_id, client_email e private_key.',
    );
  }

  return { projectId, clientEmail };
}

export function validateProductionEnvironment(env) {
  const domain = requireValue(env, 'APP_DOMAIN', 3);
  if (
    domain.includes('://') ||
    domain.includes('/') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.example')
  ) {
    throw new Error(
      'APP_DOMAIN deve ser apenas o domínio real, sem https:// nem caminho.',
    );
  }

  const email = requireValue(env, 'ACME_EMAIL', 5);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('ACME_EMAIL precisa ser um email válido.');
  }

  requireValue(env, 'POSTGRES_PASSWORD', 24);
  const databaseUrl = requireValue(env, 'DATABASE_URL', 20);
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL precisa ser uma URL PostgreSQL válida.');
  }
  if (
    parsedDatabaseUrl.protocol !== 'postgresql:' ||
    parsedDatabaseUrl.hostname !== 'postgres'
  ) {
    throw new Error(
      'DATABASE_URL de deploy/prod deve usar PostgreSQL no host interno "postgres".',
    );
  }

  requireInteger(env, 'DB_POOL_MAX', 1, 100);
  const dbSsl = requireValue(env, 'DB_SSL');
  if (dbSsl !== 'true' && dbSsl !== 'false') {
    throw new Error('DB_SSL deve ser true ou false.');
  }
  requireInteger(env, 'SHUTDOWN_TIMEOUT_MS', 1000, 60000);

  requireValue(env, 'OTP_HASH_SECRET', 32);
  requireValue(env, 'OTP_RATE_LIMIT_SECRET', 32);
  assertHttps(requireValue(env, 'OTP_WEBHOOK_URL', 12), 'OTP_WEBHOOK_URL');
  requireValue(env, 'OTP_WEBHOOK_TOKEN', 20);

  const mfaKey = requireValue(env, 'ADMIN_MFA_ENCRYPTION_KEY', 32);
  assertBase64Bytes(mfaKey, 32, 'ADMIN_MFA_ENCRYPTION_KEY');
  requireValue(env, 'ADMIN_LOGIN_RATE_LIMIT_SECRET', 32);
  const payoutApproverUserId =
    env.get('ADMIN_PAYOUT_APPROVER_USER_ID') ?? '';
  if (
    payoutApproverUserId !== '' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payoutApproverUserId,
    )
  ) {
    throw new Error(
      'ADMIN_PAYOUT_APPROVER_USER_ID deve ser um UUID de usuário Admin válido.',
    );
  }

  requireInteger(env, 'ROUTING_TIMEOUT_MS', 250, 30000);
  requireValue(env, 'GOOGLE_MAPS_SERVER_API_KEY', 20);
  requireValue(env, 'PLACE_PROOF_SECRET', 32);
  requireInteger(env, 'PLACE_PROOF_TTL_SECONDS', 60, 3600);

  const documentKey = requireValue(
    env,
    'DOCUMENT_INSPECTION_ENCRYPTION_KEY',
    32,
  );
  assertBase64Bytes(
    documentKey,
    32,
    'DOCUMENT_INSPECTION_ENCRYPTION_KEY',
  );
  requireInteger(
    env,
    'DOCUMENT_INSPECTION_TTL_SECONDS',
    15,
    600,
  );

  requireValue(env, 'MERCADO_PAGO_ACCESS_TOKEN', 20);
  requireValue(env, 'MERCADO_PAGO_WEBHOOK_SECRET', 16);

  const pushProvider = requireValue(env, 'PUSH_PROVIDER');
  if (pushProvider !== 'fcm') {
    throw new Error(
      'PUSH_PROVIDER deve ser fcm no deploy de produção.',
    );
  }

  const firebaseServiceAccountHostFile = requireValue(
    env,
    'FIREBASE_SERVICE_ACCOUNT_HOST_FILE',
    6,
  );
  if (
    firebaseServiceAccountHostFile.includes('\n') ||
    firebaseServiceAccountHostFile.includes('\r') ||
    firebaseServiceAccountHostFile.trim() !==
      firebaseServiceAccountHostFile ||
    firebaseServiceAccountHostFile.startsWith('{') ||
    !firebaseServiceAccountHostFile.toLowerCase().endsWith('.json')
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_HOST_FILE deve apontar para um arquivo JSON privado.',
    );
  }

  const payoutName = env.get('DRIVER_PAYOUT_PROVIDER_NAME') ?? '';
  const payoutUrl = env.get('DRIVER_PAYOUT_PROVIDER_URL') ?? '';
  const payoutToken = env.get('DRIVER_PAYOUT_PROVIDER_TOKEN') ?? '';
  if (payoutName || payoutUrl || payoutToken) {
    requireValue(env, 'DRIVER_PAYOUT_PROVIDER_NAME', 2);
    assertHttps(
      requireValue(env, 'DRIVER_PAYOUT_PROVIDER_URL', 12),
      'DRIVER_PAYOUT_PROVIDER_URL',
    );
    requireValue(env, 'DRIVER_PAYOUT_PROVIDER_TOKEN', 20);
  }
  requireInteger(
    env,
    'DRIVER_PAYOUT_RECONCILE_INTERVAL_SECONDS',
    15,
    3600,
  );

  return {
    domain,
    pushProvider,
    firebaseServiceAccountHostFile,
    payoutConfigured: Boolean(payoutName),
  };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const envFileArg = process.argv
  .slice(2)
  .find((value) => value.startsWith('--env-file='));
const envFile = resolve(
  here,
  envFileArg?.slice('--env-file='.length) || '.env',
);

const raw = await readFile(envFile, 'utf8');
const result = validateProductionEnvironment(parseEnv(raw));
const firebaseServiceAccountPath = resolve(
  here,
  result.firebaseServiceAccountHostFile,
);
const firebase = await validateFirebaseServiceAccountFile(
  firebaseServiceAccountPath,
);

console.log(
  'Configuração de produção válida para ' +
    result.domain +
    '. Push: ' +
    result.pushProvider +
    ' (' +
    firebase.projectId +
    '). Repasse automático: ' +
    (result.payoutConfigured ? 'configurado' : 'desativado') +
    '.',
);
