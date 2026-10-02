import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingFirebaseConfiguration } from './firebase.mjs';

function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) throw new Error('Linha inválida no .env: ' + line);
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (values.has(key)) throw new Error('Variável duplicada no .env: ' + key);
    values.set(key, value);
  }
  return values;
}
function requireValue(env, key, minLength = 1) {
  const value = env.get(key) ?? '';
  if (value.length < minLength || value === 'CHANGE_ME' || value.startsWith('REPLACE_WITH_')) {
    throw new Error(key + ' precisa ser configurada.');
  }
  return value;
}
function requireInteger(env, key, min, max) {
  const value = Number(requireValue(env, key));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(key + ' deve ser inteiro entre ' + min + ' e ' + max + '.');
  }
  return value;
}
function uuidOrEmpty(env, key) {
  const value = env.get(key) ?? '';
  if (value !== '' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(key + ' deve ser um UUID de usuário Admin válido.');
  }
}
function assertBase64Bytes(value, bytes, key) {
  if (Buffer.from(value, 'base64').length !== bytes) {
    throw new Error(key + ' deve conter exatamente ' + bytes + ' bytes em base64.');
  }
}

export function validateStagingEnvironment(env) {
  const domain = requireValue(env, 'APP_DOMAIN', 3);
  if (domain.includes('://') || domain.includes('/') || domain.endsWith('.invalid') || domain.endsWith('.example')) {
    throw new Error('APP_DOMAIN deve ser apenas o domínio de homologação.');
  }
  const email = requireValue(env, 'ACME_EMAIL', 5);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ACME_EMAIL precisa ser um email válido.');

  requireValue(env, 'POSTGRES_PASSWORD', 24);
  const databaseUrl = requireValue(env, 'DATABASE_URL', 20);
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL inválida.'); }
  if (parsed.protocol !== 'postgresql:' || parsed.hostname !== 'postgres') {
    throw new Error('DATABASE_URL deve usar o PostgreSQL interno no host "postgres".');
  }
  requireInteger(env, 'DB_POOL_MAX', 1, 100);
  requireInteger(env, 'SHUTDOWN_TIMEOUT_MS', 1000, 60000);
  requireValue(env, 'OTP_HASH_SECRET', 32);
  requireValue(env, 'OTP_RATE_LIMIT_SECRET', 32);
  assertBase64Bytes(requireValue(env, 'ADMIN_MFA_ENCRYPTION_KEY', 32), 32, 'ADMIN_MFA_ENCRYPTION_KEY');
  requireValue(env, 'ADMIN_LOGIN_RATE_LIMIT_SECRET', 32);
  uuidOrEmpty(env, 'ADMIN_OWNER_USER_ID');
  uuidOrEmpty(env, 'ADMIN_PAYOUT_APPROVER_USER_ID');
  requireInteger(env, 'ROUTING_TIMEOUT_MS', 250, 30000);
  requireValue(env, 'PLACE_PROOF_SECRET', 32);
  requireInteger(env, 'PLACE_PROOF_TTL_SECONDS', 60, 3600);
  assertBase64Bytes(requireValue(env, 'DOCUMENT_INSPECTION_ENCRYPTION_KEY', 32), 32, 'DOCUMENT_INSPECTION_ENCRYPTION_KEY');
  requireInteger(env, 'DOCUMENT_INSPECTION_TTL_SECONDS', 15, 600);

  const mpToken = env.get('MERCADO_PAGO_ACCESS_TOKEN_TEST') ?? '';
  const mpSecret = env.get('MERCADO_PAGO_WEBHOOK_SECRET') ?? '';
  if ((mpToken && mpToken.length < 20) || (mpSecret && mpSecret.length < 16) || Boolean(mpToken) !== Boolean(mpSecret)) {
    throw new Error('Mercado Pago sandbox deve ficar totalmente vazio ou ter token e webhook secret válidos juntos.');
  }
  return { domain, mercadoPagoSandboxConfigured: Boolean(mpToken) };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const envFileArg = process.argv.slice(2).find((value) => value.startsWith('--env-file='));
const envFile = resolve(here, envFileArg?.slice('--env-file='.length) || '.env');
const result = validateStagingEnvironment(parseEnv(await readFile(envFile, 'utf8')));
const firebase = await stagingFirebaseConfiguration(envFile);
console.log('Configuração de homologação válida para ' + result.domain + '. Mercado Pago sandbox: ' +
  (result.mercadoPagoSandboxConfigured ? 'configurado' : 'desativado') + '. Push: ' + firebase.provider + '.');
