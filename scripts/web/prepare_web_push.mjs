import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const role = process.argv.find(arg => arg.startsWith('--role='))?.slice(7);
if (!['passenger', 'driver'].includes(role)) throw new Error('Informe --role=passenger|driver');
const directory = resolve(new URL('../../apps/' + role + '/web/', import.meta.url).pathname);
const fields = { apiKey: 'API_KEY', appId: 'APP_ID', projectId: 'PROJECT_ID', messagingSenderId: 'MESSAGING_SENDER_ID', vapidKey: 'VAPID_KEY' };
const config = Object.fromEntries(Object.entries(fields).map(([key, suffix]) => [key, process.env['RAMO_FIREBASE_WEB_' + suffix]?.trim() ?? '']));
const present = Object.values(config).filter(Boolean).length;
if (present && (present !== 5 || !config.appId.includes(':web:') ||
  !/^\d+$/.test(config.messagingSenderId) || !/^[A-Za-z0-9_-]{87}$/.test(config.vapidKey))) {
  throw new Error('Configuração Firebase Web incompleta/inválida; use appId Web e VAPID público.');
}
// Copiar somente código compartilhado e cinco valores públicos. Nenhuma chave privada.
for (const file of ['ramo_web_push.js', 'ramo_push_worker.js']) {
  await copyFile(new URL('../../packages/ramo_push/web/' + file, import.meta.url), directory + '/' + file);
}
await writeFile(directory + '/ramo_push_config.js', '// Configuração pública gerada; Web Push desativado quando null.\nself.ramoPushConfig = ' + JSON.stringify(present ? config : null) + ';\n');
const index = await readFile(directory + '/index.html', 'utf8');
if (!index.includes('ramo_web_push.js')) throw new Error('Entrypoint Web não carrega o bridge.');
console.log('Web Push ' + role + ': ' + (present ? 'configuração pública preparada' : 'desativado (revisão sem credenciais)'));
