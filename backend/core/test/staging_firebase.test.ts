import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, chown, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
// @ts-expect-error Deployment helpers are executable JavaScript modules.
import { validateFirebaseAccount } from '../../../deploy/staging/firebase.mjs';

const root = resolve(process.cwd(), '../..');
const helper = pathToFileURL(resolve(root, 'deploy/staging/firebase.mjs')).href;
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' }).toString();
const account = { type: 'service_account', project_id: 'ramo-nessa-test',
  client_email: 'firebase-adminsdk@ramo-nessa-test.iam.gserviceaccount.com', private_key: key };

function invoke(envFile: string) {
  const code = `import { stagingComposeArguments, stagingComposeEnvironment } from ${JSON.stringify(helper)};
    process.env.FIREBASE_SERVICE_ACCOUNT_HOST_FILE = '/unvalidated/another-project.json';
    try { console.log(JSON.stringify({args:await stagingComposeArguments(${JSON.stringify(envFile)}),
      shellOverride: stagingComposeEnvironment().FIREBASE_SERVICE_ACCOUNT_HOST_FILE ?? null})); }
    catch (e) { console.error(e.message); process.exit(1); }`;
  const args = [process.execPath, '--input-type=module', '-e', code];
  return process.getuid?.() === 0
    ? spawnSync(args[0]!, args.slice(1), { encoding: 'utf8' })
    : spawnSync('sudo', ['-n', ...args], { encoding: 'utf8' });
}

test('staging FCM validates project and RSA credentials without disclosing secrets', () => {
  assert.doesNotThrow(() => validateFirebaseAccount(account, 'ramo-nessa-test'));
  for (const invalid of [
    { ...account, project_id: 'another-project' },
    { ...account, client_email: 'other@another-project.iam.gserviceaccount.com' },
    { ...account, private_key: 'PRIVATE MATERIAL MUST NOT APPEAR' },
    { ...account, type: 'authorized_user' },
    { ...account, private_key: generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() },
  ]) {
    assert.throws(() => validateFirebaseAccount(invalid, 'ramo-nessa-test'), (error: any) => {
      assert.ok(!error.message.includes('PRIVATE MATERIAL'));
      assert.ok(!error.message.includes(key));
      return true;
    });
  }
});

const ownershipProbe = await mkdtemp(resolve(tmpdir(), 'ramo-uid-probe-'));
let ownershipSupported = false;
try {
  const probe = resolve(ownershipProbe, 'probe');
  await writeFile(probe, 'fixture');
  if (process.getuid?.() === 0) { await chown(probe, 1000, 1000); ownershipSupported = true; }
  else ownershipSupported = spawnSync('sudo', ['-n', 'chown', '1000:1000', probe]).status === 0;
} catch {} finally { await rm(ownershipProbe, { recursive: true, force: true }); }

test('staging FCM validates real credential files before selecting the private overlay',
  { skip: !ownershipSupported && !process.env.CI }, async () => {
  assert.equal(ownershipSupported, true, 'CI must support actual private-file ownership verification');
  const dir = await mkdtemp(resolve(tmpdir(), 'ramo-firebase-test-'));
  const envFile = resolve(dir, 'test.env');
  const credential = resolve(dir, 'service-account.json');
  const setCredential = async (value: unknown, mode = 0o600) => {
    await rm(credential, { force: true });
    await writeFile(credential, JSON.stringify(value), { mode: 0o600 });
    await chmod(credential, mode);
    if (process.getuid?.() === 0) await chown(credential, 1000, 1000);
    else assert.equal(spawnSync('sudo', ['-n', 'chown', '1000:1000', credential]).status, 0);
  };
  const setConfig = async (extra: string) => writeFile(envFile,
    `FIREBASE_PROJECT_ID=ramo-nessa-test\nFIREBASE_SERVICE_ACCOUNT_HOST_FILE=${credential}\n${extra}\n`);
  try {
    await writeFile(envFile, '# Existing staging env, no new settings\n');
    let result = invoke(envFile);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).args.length, 5, 'existing configuration keeps Push disabled');

    await setConfig('PUSH_PROVIDER=fcm');
    result = invoke(envFile);
    assert.notEqual(result.status, 0, 'missing credential cannot enable FCM');
    await setCredential(account);
    result = invoke(envFile);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.ok(config.args.at(-1).endsWith('compose.firebase.yml'));
    assert.equal(config.shellOverride, null);

    for (const invalid of [
      { ...account, project_id: 'another-project' },
      { ...account, client_email: 'other@another-project.iam.gserviceaccount.com' },
      { ...account, private_key: 'PRIVATE MATERIAL MUST NOT APPEAR' },
      { ...account, type: 'authorized_user' },
    ]) {
      await setCredential(invalid);
      result = invoke(envFile);
      assert.notEqual(result.status, 0);
      assert.ok(!result.stderr.includes('PRIVATE MATERIAL'));
      assert.ok(!result.stderr.includes(key));
    }
    await setCredential(account, 0o644);
    assert.notEqual(invoke(envFile).status, 0, 'world-readable key rejected');
    await setCredential(account, 0o000);
    assert.notEqual(invoke(envFile).status, 0, 'unreadable key rejected');
    await setCredential(account);
    const link = resolve(dir, 'linked.json');
    await symlink(credential, link);
    await writeFile(envFile, `PUSH_PROVIDER=fcm\nFIREBASE_PROJECT_ID=ramo-nessa-test\nFIREBASE_SERVICE_ACCOUNT_HOST_FILE=${link}\n`);
    assert.notEqual(invoke(envFile).status, 0, 'symlink rejected');
    await setConfig('PUSH_PROVIDER=webhook');
    assert.notEqual(invoke(envFile).status, 0, 'unsupported provider rejected');
    await setConfig('PUSH_PROVIDER=fcm\nPUSH_PROVIDER=disabled');
    assert.notEqual(invoke(envFile).status, 0, 'duplicate settings rejected');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Docker composes FCM only into Core and retains staging safeguards',
  { skip: !process.env.CI && spawnSync('docker', ['compose', 'version']).status !== 0 }, async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'ramo-fcm-compose-'));
    try {
      const envFile = resolve(dir, '.env');
      await writeFile(envFile, [
        'APP_DOMAIN=staging.ramonessa.test', 'ACME_EMAIL=ops@ramonessa.test',
        'POSTGRES_PASSWORD=fixture-password-only', 'DATABASE_URL=postgresql://ramonessa:fixture@postgres/ramonessa',
        ...['OTP_HASH_SECRET','OTP_RATE_LIMIT_SECRET','ADMIN_MFA_ENCRYPTION_KEY','ADMIN_LOGIN_RATE_LIMIT_SECRET',
          'PLACE_PROOF_SECRET','DOCUMENT_INSPECTION_ENCRYPTION_KEY'].map(k => `${k}=fixture-only`),
        'FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/private/fixture-service-account.json',
      ].join('\n'));
      const result = spawnSync('docker', ['compose', '--env-file', envFile,
        '-f', resolve(root, 'deploy/staging/compose.yml'),
        '-f', resolve(root, 'deploy/staging/compose.firebase.yml'), 'config', '--format', 'json'],
      { encoding: 'utf8', env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_HOST_FILE: '/private/fixture-service-account.json' } });
      assert.equal(result.status, 0, result.stderr);
      const config = JSON.parse(result.stdout);
      assert.equal(config.services.core.environment.PUSH_PROVIDER, 'fcm');
      assert.equal(config.services.core.environment.ALLOW_DEV_IDENTITY, 'false');
      assert.equal(config.services.core.environment.ALLOW_DEV_PAYMENT_GATEWAY, 'false');
      assert.equal(config.services.core.environment.MERCADO_PAGO_MODE, 'test');
      for (const [name, service] of Object.entries(config.services) as [string, any][]) {
        const secretMounts = (service.volumes ?? []).filter((v: any) => v.target === '/run/secrets/ramo-nessa-firebase.json');
        assert.equal(secretMounts.length, name === 'core' ? 1 : 0);
        if (name === 'core') {
          assert.equal(secretMounts[0].read_only, true);
          // Compose omits false-valued bind options from normalized JSON.
          assert.equal(secretMounts[0].bind?.create_host_path ?? false, false);
          assert.match(await readFile(resolve(root, 'deploy/staging/compose.firebase.yml'), 'utf8'),
            /create_host_path:\s*false/);
          assert.ok(service.volumes.some((v: any) => v.target === '/var/lib/ramo-nessa'));
        }
      }
      for (const script of ['start.mjs', 'set-owner.mjs']) {
        assert.match(await readFile(resolve(root, 'deploy/staging', script), 'utf8'), /stagingComposeArguments/);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
