import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
// @ts-expect-error Deployment helper is executable JavaScript.
import { stagingGoogleMapsConfiguration } from '../../../deploy/staging/google-maps.mjs';
// @ts-expect-error Deployment helper is executable JavaScript.
import { stagingComposeArguments, stagingComposeEnvironment } from '../../../deploy/staging/firebase.mjs';

const root = resolve(process.cwd(), '../..');
const key = 'AIza' + 'x'.repeat(35);

test('Maps opt-in rejects unsafe files and overrides without exposing the key', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'ramo-maps-'));
  const envFile = resolve(dir, '.env');
  const keyFile = resolve(dir, 'key');
  const config = (extra = '') => writeFile(envFile,
    `GOOGLE_MAPS_PROVIDER=google\nGOOGLE_MAPS_SERVER_API_KEY_HOST_FILE=${keyFile}\n${extra}`);
  try {
    await writeFile(envFile, '# Existing configuration\n');
    assert.deepEqual(await stagingGoogleMapsConfiguration(envFile), { provider: 'mock' });
    assert.equal((await stagingComposeArguments(envFile)).length, 5);
    await config();
    await assert.rejects(stagingGoogleMapsConfiguration(envFile));
    await writeFile(keyFile, key, { mode: 0o600 });
    const maps = await stagingGoogleMapsConfiguration(envFile);
    assert.equal(maps.apiKey, key);
    assert.ok((await stagingComposeArguments(envFile)).at(-1).endsWith('compose.google-maps.yml'));
    const inherited = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    try {
      process.env.GOOGLE_MAPS_SERVER_API_KEY = 'unvalidated-shell-key';
      assert.equal(stagingComposeEnvironment().GOOGLE_MAPS_SERVER_API_KEY, undefined);
      assert.equal(stagingComposeEnvironment(maps).GOOGLE_MAPS_SERVER_API_KEY, key);
    } finally {
      if (inherited === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
      else process.env.GOOGLE_MAPS_SERVER_API_KEY = inherited;
    }
    for (const mode of [0o644, 0o000]) {
      await chmod(keyFile, mode);
      await assert.rejects(stagingGoogleMapsConfiguration(envFile));
    }
    await chmod(keyFile, 0o600);
    await writeFile(keyFile, 'PRIVATE MATERIAL MUST NOT APPEAR');
    await assert.rejects(stagingGoogleMapsConfiguration(envFile), (e: any) => {
      assert.ok(!e.message.includes('PRIVATE MATERIAL')); return true;
    });
    const link = resolve(dir, 'link');
    await symlink(keyFile, link);
    await writeFile(envFile, `GOOGLE_MAPS_PROVIDER=google\nGOOGLE_MAPS_SERVER_API_KEY_HOST_FILE=${link}`);
    await assert.rejects(stagingGoogleMapsConfiguration(envFile));
    await config('GOOGLE_MAPS_PROVIDER=mock\n');
    await assert.rejects(stagingGoogleMapsConfiguration(envFile));
    await writeFile(envFile, 'GOOGLE_MAPS_PROVIDER=unknown');
    await assert.rejects(stagingGoogleMapsConfiguration(envFile));
    for (const script of ['start.mjs', 'set-owner.mjs']) {
      assert.match(await readFile(resolve(root, 'deploy/staging', script), 'utf8'), /stagingComposeEnvironment\(maps\)/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Maps overlay targets official APIs only in Core and composes with Firebase',
  { skip: !process.env.CI && spawnSync('docker', ['compose', 'version']).status !== 0 }, async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'ramo-maps-compose-'));
    try {
      const envFile = resolve(dir, '.env');
      await writeFile(envFile, [
        'APP_DOMAIN=staging.ramonessa.test', 'ACME_EMAIL=ops@ramonessa.test',
        'POSTGRES_PASSWORD=fixture-only', 'DATABASE_URL=postgresql://ramonessa:fixture@postgres/ramonessa',
        ...['OTP_HASH_SECRET', 'OTP_RATE_LIMIT_SECRET', 'ADMIN_MFA_ENCRYPTION_KEY',
          'ADMIN_LOGIN_RATE_LIMIT_SECRET', 'PLACE_PROOF_SECRET', 'DOCUMENT_INSPECTION_ENCRYPTION_KEY']
          .map(k => `${k}=fixture-only`),
        'FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/private/fixture.json',
      ].join('\n'));
      for (const fcm of [false, true]) {
        const args = ['compose', '--env-file', envFile, '-f', resolve(root, 'deploy/staging/compose.yml')];
        if (fcm) args.push('-f', resolve(root, 'deploy/staging/compose.firebase.yml'));
        args.push('-f', resolve(root, 'deploy/staging/compose.google-maps.yml'), 'config', '--format', 'json');
        const result = spawnSync('docker', args, { encoding: 'utf8', env: {
          ...stagingComposeEnvironment({ provider: 'google', apiKey: key }),
          FIREBASE_SERVICE_ACCOUNT_HOST_FILE: '/private/fixture.json',
        } });
        assert.equal(result.status, 0, result.stderr);
        const services = JSON.parse(result.stdout).services;
        const core = services.core.environment;
        assert.equal(core.GOOGLE_MAPS_SERVER_API_KEY, key);
        assert.equal(core.GOOGLE_ROUTES_BASE_URL, 'https://routes.googleapis.com/');
        assert.equal(core.GOOGLE_PLACES_BASE_URL, 'https://places.googleapis.com/v1/');
        assert.equal(core.PUSH_PROVIDER, fcm ? 'fcm' : 'disabled');
        assert.equal(core.ALLOW_DEV_IDENTITY, 'false');
        assert.equal(core.ALLOW_DEV_PAYMENT_GATEWAY, 'false');
        assert.equal(core.MERCADO_PAGO_MODE, 'test');
        for (const [name, service] of Object.entries(services) as [string, any][]) {
          if (name !== 'core') assert.notEqual(service.environment?.GOOGLE_MAPS_SERVER_API_KEY, key);
        }
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
