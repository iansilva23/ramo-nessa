import { createPrivateKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingGoogleMapsConfiguration } from './google-maps.mjs';
import { stagingOtpConfiguration } from './otp.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

export function validateFirebaseAccount(account, projectId) {
  if (account?.type !== 'service_account' || account.project_id !== projectId ||
      typeof account.client_email !== 'string' ||
      !account.client_email.endsWith('@' + projectId + '.iam.gserviceaccount.com')) {
    throw new Error('Credencial Firebase não pertence ao projeto esperado.');
  }
  try {
    const key = createPrivateKey(account.private_key);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error();
  } catch {
    throw new Error('Credencial Firebase não contém chave RSA válida de pelo menos 2048 bits.');
  }
}

export async function stagingFirebaseConfiguration(envFile) {
  const raw = await readFile(envFile, 'utf8');
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^(PUSH_PROVIDER|FIREBASE_PROJECT_ID|FIREBASE_SERVICE_ACCOUNT_HOST_FILE)\s*=(.*)$/);
    if (!match) continue;
    if (values.has(match[1])) throw new Error('Configuração Firebase duplicada: ' + match[1]);
    values.set(match[1], match[2].trim());
  }
  const provider = values.get('PUSH_PROVIDER') ?? 'disabled';
  if (provider === 'disabled') return { provider };
  if (provider !== 'fcm') throw new Error('PUSH_PROVIDER deve ser disabled ou fcm na homologação.');
  const projectId = values.get('FIREBASE_PROJECT_ID') ?? '';
  const hostFile = values.get('FIREBASE_SERVICE_ACCOUNT_HOST_FILE') ?? '';
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('FIREBASE_PROJECT_ID precisa identificar o projeto esperado.');
  }
  if (!isAbsolute(hostFile) || !hostFile.endsWith('.json') || /[\x00-\x20$]/.test(hostFile)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_HOST_FILE deve ser um caminho absoluto para JSON privado, sem espaços ou interpolação.');
  }
  let info;
  let account;
  try {
    info = await lstat(hostFile);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || (info.mode & 0o400) === 0 || info.uid !== 1000) throw new Error();
    account = JSON.parse(await readFile(hostFile, 'utf8'));
  } catch {
    throw new Error('Credencial Firebase deve ser arquivo regular legível, privado (0600) e pertencente ao UID 1000 do Core.');
  }
  validateFirebaseAccount(account, projectId);
  return { provider, projectId, hostFile };
}

export async function stagingComposeArguments(envFile) {
  const firebase = await stagingFirebaseConfiguration(envFile);
  const args = ['compose', '--env-file', envFile, '-f', resolve(here, 'compose.yml')];
  if (firebase.provider === 'fcm') args.push('-f', resolve(here, 'compose.firebase.yml'));
  const maps = await stagingGoogleMapsConfiguration(envFile);
  if (maps.provider === 'google') args.push('-f', resolve(here, 'compose.google-maps.yml'));
  const otp = await stagingOtpConfiguration(envFile);
  if (otp.provider === 'entrar-whatsapp') args.push('-f', resolve(here, 'compose.otp.yml'));
  return args;
}

// Docker interpolation must use the file we validated, not inherited shell values.
export function stagingComposeEnvironment(maps = { provider: 'mock' }, otp = { provider: 'dev' }) {
  const env = { ...process.env };
  for (const key of ['PUSH_PROVIDER', 'FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT_HOST_FILE']) delete env[key];
  for (const key of ['GOOGLE_MAPS_PROVIDER', 'GOOGLE_MAPS_SERVER_API_KEY_HOST_FILE',
    'GOOGLE_MAPS_SERVER_API_KEY', 'GOOGLE_ROUTES_BASE_URL', 'GOOGLE_PLACES_BASE_URL']) delete env[key];
  for (const key of ['OTP_PROVIDER', 'ENTRAR_API_SECRET', 'ENTRAR_API_SECRET_HOST_FILE']) delete env[key];
  if (otp.provider === 'entrar-whatsapp') env.ENTRAR_API_SECRET = otp.secret;
  if (maps.provider === 'google') env.GOOGLE_MAPS_SERVER_API_KEY = maps.apiKey;
  return env;
}
