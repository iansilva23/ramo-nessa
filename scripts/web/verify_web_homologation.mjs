// Read-only gate for a pair of bundles intended for FULL Web Push homologation.
// It does not publish, authorize a deploy, contact providers or inspect the VPS.
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const roles = ['passenger', 'driver'];
const fields = ['apiKey', 'appId', 'projectId', 'messagingSenderId', 'vapidKey'];
const privateMarker = /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/;

async function safeTree(directory) {
  let root;
  try { root = await lstat(directory); } catch { throw new Error('Diretório de bundle ausente.'); }
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Diretório de bundle inseguro.');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error('Bundle contém link ou arquivo especial.');
    }
    if (/^(?:\.env(?:\..*)?|\.git|google-services\.json|GoogleService-Info\.plist)$/i.test(entry.name)
      || /\.(?:pem|key|p12|pfx|jks|sql|dump)$/i.test(entry.name)) {
      throw new Error('Bundle contém arquivo de configuração privada ou backup.');
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await safeTree(path); continue; }
    // Keep only a short overlap; never log file contents or credential values.
    let tail = '';
    for await (const bytes of createReadStream(path)) {
      const text = tail + bytes.toString('latin1');
      if (privateMarker.test(text)) throw new Error('Bundle contém marcador de chave privada.');
      tail = text.slice(-128);
    }
  }
}

async function pushConfiguration(directory, role, expectedProject) {
  let value;
  try {
    const source = await readFile(join(directory, 'ramo_push_config.js'), 'utf8');
    if (source.length > 16384) throw new Error();
    // Parse only generated JSON. Never evaluate JavaScript from an artifact.
    const match = source.match(/^\/\/[^\n]*\nself\.ramoPushConfig = ([\s\S]+);\s*$/);
    if (!match) throw new Error();
    value = JSON.parse(match[1]);
  } catch { throw new Error('Configuração pública de push ausente/inválida: ' + role); }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Push desativado no bundle de revisão: ' + role);
  }
  if (Object.keys(value).length !== fields.length || fields.some(field =>
    typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 512 || value[field] !== value[field].trim())) {
    throw new Error('Configuração push deve conter somente os cinco campos públicos: ' + role);
  }
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(value.apiKey)
    || !/^\d+$/.test(value.messagingSenderId)
    || !new RegExp('^1:' + value.messagingSenderId + ':web:[a-f0-9]+$').test(value.appId)
    || value.projectId !== expectedProject) {
    throw new Error('Identidade/configuração Firebase Web incompatível: ' + role);
  }
  const key = Buffer.from(value.vapidKey, 'base64url');
  if (!/^[A-Za-z0-9_-]{87}$/.test(value.vapidKey) || key.length !== 65 || key[0] !== 4
    || key.toString('base64url') !== value.vapidKey) {
    throw new Error('VAPID público malformado: ' + role);
  }
  return value;
}

export async function verifyWebHomologation({ passenger, driver, expectedProject }) {
  if (!passenger || !driver || typeof expectedProject !== 'string' || !expectedProject.trim()
    || expectedProject !== expectedProject.trim()) {
    throw new Error('Informe dois bundles e o projeto Firebase esperado.');
  }
  const directories = { passenger: resolve(passenger), driver: resolve(driver) };
  if (directories.passenger === directories.driver) throw new Error('Os dois bundles precisam de diretórios distintos.');
  const configs = {};
  for (const role of roles) {
    await safeTree(directories[role]);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify_web_bundle.mjs', import.meta.url)),
      '--role=' + role, '--dist=' + directories[role]], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Estrutura/Maps inválidos no bundle: ' + role);
    configs[role] = await pushConfiguration(directories[role], role, expectedProject);
  }
  if (configs.passenger.appId === configs.driver.appId) throw new Error('AppIds Web devem ser distintos entre os apps.');
  if (configs.passenger.messagingSenderId !== configs.driver.messagingSenderId) {
    throw new Error('Os apps devem usar o mesmo remetente do projeto Firebase esperado.');
  }
  return { roles: [...roles], structuralCheck: true, providerHomologation: false, deployAuthorized: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = ['--passenger=', '--driver=', '--firebase-project='];
    if (args.length !== 3 || options.some(prefix => args.filter(arg => arg.startsWith(prefix)).length !== 1)) {
      throw new Error('Uso: --passenger=<bundle> --driver=<bundle> --firebase-project=<projeto>');
    }
    const get = prefix => args.find(arg => arg.startsWith(prefix)).slice(prefix.length);
    await verifyWebHomologation({ passenger: get(options[0]), driver: get(options[1]), expectedProject: get(options[2]) });
    console.log('OK: dois bundles, Maps sem placeholder e configuração pública push coerente.');
    console.log('Somente leitura. Provedores/dispositivos, origem das chaves e versão do Core ainda exigem homologação.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
