const args = new Map(
  process.argv.slice(2).map((item) => {
    const index = item.indexOf('=');
    if (index < 3 || !item.startsWith('--')) return [item, ''];
    return [item.slice(2, index), item.slice(index + 1)];
  }),
);

const platform = args.get('platform')?.trim() ?? '';
const surface = args.get('surface')?.trim() || 'Firebase mobile';

if (platform !== 'android' && platform !== 'ios') {
  throw new Error('--platform deve ser android ou ios.');
}

function required(name, minLength = 1) {
  const raw = process.env[name] ?? '';
  const value = raw.trim();
  if (
    value.length < minLength ||
    value !== raw ||
    /\s/.test(value) ||
    /[\u0000-\u001F\u007F]/.test(value) ||
    value === 'CHANGE_ME' ||
    value.startsWith('REPLACE_WITH_') ||
    /example|placeholder|dummy/i.test(value)
  ) {
    throw new Error(surface + ': ' + name + ' ausente ou inválido.');
  }
  return value;
}

const apiKey = required('RAMO_FIREBASE_API_KEY', 20);
const appId = required('RAMO_FIREBASE_APP_ID', 12);
const senderId = required('RAMO_FIREBASE_MESSAGING_SENDER_ID', 6);
const projectId = required('RAMO_FIREBASE_PROJECT_ID', 3);

if (!/^\d{6,32}$/.test(senderId)) {
  throw new Error(surface + ': Messaging Sender ID deve ser numérico.');
}

if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(projectId)) {
  throw new Error(surface + ': Project ID Firebase possui formato inválido.');
}

const match = /^1:(\d+):(android|ios):([A-Za-z0-9]+)$/.exec(appId);
if (match == null) {
  throw new Error(surface + ': Firebase App ID possui formato inválido.');
}

if (match[1] !== senderId) {
  throw new Error(
    surface + ': Firebase App ID e Messaging Sender ID não pertencem ao mesmo sender.',
  );
}

if (match[2] !== platform) {
  throw new Error(
    surface + ': Firebase App ID não corresponde à plataforma ' + platform + '.',
  );
}

if (apiKey.length > 256 || projectId.length > 64) {
  throw new Error(surface + ': configuração Firebase excede tamanho permitido.');
}

console.log(surface + ': configuração Firebase básica válida.');
