import { readFile, lstat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = process.argv.find((arg) => arg.startsWith('--dist='))?.slice(7);
const role = process.argv.find((arg) => arg.startsWith('--role='))?.slice(7);
const allowReviewPlaceholder = process.argv.includes('--ci-review') &&
  process.env.GITHUB_ACTIONS === 'true';

if (!['passenger', 'driver'].includes(role) || !root) {
  throw new Error('Uso: node verify_web_bundle.mjs --role=passenger|driver --dist=/caminho/absoluto');
}
const expected = role === 'passenger' ? '/passageiro/' : '/motorista/';
const directory = resolve(root);

async function regularFile(relative) {
  const path = join(directory, relative);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
    throw new Error('Arquivo ausente/inseguro/vazio: ' + relative);
  }
  return readFile(path);
}

const index = (await regularFile('index.html')).toString('utf8');
const manifest = JSON.parse((await regularFile('manifest.json')).toString('utf8'));
await regularFile('flutter_bootstrap.js');
await regularFile('main.dart.js');
for (const file of ['ramo_web_push.js', 'ramo_push_worker.js', 'ramo_push_config.js']) await regularFile(file);
if (!index.includes('src="ramo_push_config.js"') || !index.includes('src="ramo_web_push.js"')) {
  throw new Error('Web Push bridge/config missing from isolated app entry point.');
}
if (role === 'passenger') {
  await regularFile('ramo_card_fields.js');
  if (!index.includes('type="module" src="ramo_card_fields.js"')) {
    throw new Error('Secure Fields browser bridge missing from passenger entry point.');
  }
} else if (index.includes('ramo_card_fields.js')) {
  throw new Error('Passenger card module must not load in driver app.');
}

if (!index.includes('<base href="' + expected + '">')) {
  throw new Error('O base href não corresponde à rota isolada ' + expected);
}
if (!index.includes('maps.googleapis.com/maps/api/js?key=')) {
  throw new Error('Maps JavaScript API ausente no index.');
}
if (index.includes('__RAMO_GOOGLE_MAPS_WEB_KEY__')) {
  throw new Error('Placeholder de build não substituído.');
}
if (!allowReviewPlaceholder && index.includes('WEB_KEY_NOT_CONFIGURED_FOR_CI')) {
  throw new Error('Chave Maps Web real ausente: bundle apenas para revisão.');
}
if (manifest.display !== 'standalone' || manifest.start_url !== '.' || manifest.scope !== '.') {
  throw new Error('PWA fora do escopo isolado.');
}
const expectedIcons = [
  { src: 'icons/Icon-192.png', size: 192 },
  { src: 'icons/Icon-512.png', size: 512 },
];
for (const icon of expectedIcons) {
  const declared = manifest.icons?.find((entry) => entry.src === icon.src);
  if (!declared || declared.sizes !== icon.size + 'x' + icon.size) {
    throw new Error('Manifesto com resolução incorreta: ' + icon.src);
  }
  const bytes = await regularFile(icon.src);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!png || bytes.readUInt32BE(16) !== icon.size || bytes.readUInt32BE(20) !== icon.size) {
    throw new Error('PNG com tamanho real incorreto: ' + icon.src);
  }
}
const files = await readdir(directory);
if (!files.includes('assets')) throw new Error('Assets Flutter ausentes.');
console.log('OK: bundle ' + role + ', rota ' + expected + ', manifesto, icons e bootstrap íntegros.');
