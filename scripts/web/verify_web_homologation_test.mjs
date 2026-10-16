import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { verifyWebHomologation } from './verify_web_homologation.mjs';

const project = 'ramo-fixture-only';
const vapid = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');
const apiKey = 'AIza' + 'A'.repeat(35);
function config(role) {
  return { apiKey, appId: '1:123456789:web:' + (role === 'passenger' ? 'a' : 'b').repeat(16),
    projectId: project, messagingSenderId: '123456789', vapidKey: vapid };
}
async function push(root, value) {
  await writeFile(join(root, 'ramo_push_config.js'), '// Public fixture only\nself.ramoPushConfig = ' + JSON.stringify(value) + ';\n');
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ramo-web-release-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const args = { passenger: join(root, 'passenger'), driver: join(root, 'driver'), expectedProject: project };
  for (const role of ['passenger', 'driver']) {
    const dir = args[role]; await mkdir(join(dir, 'icons'), { recursive: true }); await mkdir(join(dir, 'assets'));
    const prefix = role === 'passenger' ? '/passageiro/' : '/motorista/';
    await writeFile(join(dir, 'index.html'), '<base href="' + prefix + '"><script src="ramo_push_config.js"></script>'
      + '<script src="ramo_web_push.js"></script><script src="https://maps.googleapis.com/maps/api/js?key=' + apiKey + '"></script>'
      + (role === 'passenger' ? '<script type="module" src="ramo_card_fields.js"></script>' : ''));
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ display: 'standalone', start_url: '.', scope: '.',
      icons: [192, 512].map(size => ({ src: 'icons/Icon-' + size + '.png', sizes: size + 'x' + size })) }));
    for (const file of ['flutter_bootstrap.js', 'main.dart.js', 'ramo_web_push.js', 'ramo_push_worker.js',
      ...(role === 'passenger' ? ['ramo_card_fields.js'] : [])]) await writeFile(join(dir, file), '// Synthetic structural fixture, not Flutter\n');
    for (const size of [192, 512]) {
      const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
      png.writeUInt32BE(size, 16); png.writeUInt32BE(size, 20); await writeFile(join(dir, 'icons/Icon-' + size + '.png'), png);
    }
    await push(dir, config(role));
  }
  return args;
}

test('coherent synthetic pair passes read-only structural check without authorizing providers/deploy', async t => {
  const args = await fixture(t), before = await readFile(join(args.passenger, 'ramo_push_config.js'));
  const result = await verifyWebHomologation(args);
  assert.equal(result.structuralCheck, true); assert.equal(result.providerHomologation, false); assert.equal(result.deployAuthorized, false);
  assert.deepEqual(await readFile(join(args.passenger, 'ramo_push_config.js')), before);
});
test('Maps review placeholder cannot be allowed even in GitHub Actions', async t => {
  const args = await fixture(t), path = join(args.passenger, 'index.html');
  await writeFile(path, (await readFile(path, 'utf8')).replace(apiKey, 'WEB_KEY_NOT_CONFIGURED_FOR_CI'));
  await assert.rejects(verifyWebHomologation(args), /Estrutura\/Maps inválidos/);
  const result = spawnSync(process.execPath, [new URL('./verify_web_homologation.mjs', import.meta.url).pathname,
    '--passenger=' + args.passenger, '--driver=' + args.driver, '--firebase-project=' + project],
    { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } });
  assert.equal(result.status, 1); assert.match(result.stderr, /Estrutura\/Maps inválidos/);
});
test('disabled review push blocks full push homologation', async t => {
  const args = await fixture(t); await push(args.driver, null);
  await assert.rejects(verifyWebHomologation(args), /Push desativado/);
});
test('same Firebase appId in both roles is rejected', async t => {
  const args = await fixture(t); await push(args.driver, config('passenger'));
  await assert.rejects(verifyWebHomologation(args), /AppIds Web devem ser distintos/);
});
test('unexpected project and inconsistent sender are rejected', async t => {
  const args = await fixture(t); await assert.rejects(verifyWebHomologation({ ...args, expectedProject: 'other-project' }), /incompatível/);
  const value = { ...config('driver'), messagingSenderId: '987654321', appId: '1:987654321:web:' + 'c'.repeat(16) };
  await push(args.driver, value); await assert.rejects(verifyWebHomologation(args), /mesmo remetente/);
});
test('native appId, malformed API key and malformed VAPID are rejected', async t => {
  const args = await fixture(t);
  for (const change of [{ appId: '1:123456789:android:abcdef' }, { apiKey: 'invalid-fixture-key' }, { vapidKey: 'A'.repeat(87) }]) {
    await push(args.driver, { ...config('driver'), ...change });
    await assert.rejects(verifyWebHomologation(args), /incompatível|malformado/);
  }
});
test('additional configuration fields are rejected without logging their values', async t => {
  const args = await fixture(t), sentinel = 'fixture-secret-never-log';
  await push(args.passenger, { ...config('passenger'), private_key: sentinel });
  await assert.rejects(verifyWebHomologation(args), error => !error.message.includes(sentinel) && /cinco campos públicos/.test(error.message));
});
test('JavaScript config is parsed as JSON only, never executed', async t => {
  const args = await fixture(t); globalThis.releaseFixtureExecuted = false;
  await writeFile(join(args.driver, 'ramo_push_config.js'), '// fixture\nself.ramoPushConfig = (globalThis.releaseFixtureExecuted = true, {});\n');
  await assert.rejects(verifyWebHomologation(args), /ausente\/inválida/); assert.equal(globalThis.releaseFixtureExecuted, false);
  delete globalThis.releaseFixtureExecuted;
});
test('nested symlink, private runtime file and embedded PEM marker are rejected', async t => {
  const args = await fixture(t), path = join(args.passenger, 'assets', 'link.js');
  await symlink(join(args.driver, 'main.dart.js'), path);
  await assert.rejects(verifyWebHomologation(args), /link/); await rm(path);
  const envFile = join(args.passenger, '.env'); await writeFile(envFile, 'fixture');
  await assert.rejects(verifyWebHomologation(args), /configuração privada/); await rm(envFile);
  for (const marker of ['PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'OPENSSH PRIVATE KEY']) {
    await writeFile(join(args.passenger, 'assets', 'text.txt'), 'x'.repeat(65530) + '-----BEGIN ' + marker + '-----\nfixture-only');
    await assert.rejects(verifyWebHomologation(args), /marcador de chave privada/);
  }
});
test('roles cannot share a directory and malformed CLI never starts a deployment', async t => {
  const args = await fixture(t); await assert.rejects(verifyWebHomologation({ ...args, driver: args.passenger }), /diretórios distintos/);
  const result = spawnSync(process.execPath, [new URL('./verify_web_homologation.mjs', import.meta.url).pathname, '--ci-review'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Uso:/); assert.equal(result.stdout, '');
});
