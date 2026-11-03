import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
// @ts-expect-error Deployment helper is executable JavaScript.
import { stagingOtpConfiguration } from '../../../deploy/staging/otp.mjs';
// @ts-expect-error Deployment helper is executable JavaScript.
import { stagingComposeArguments, stagingComposeEnvironment } from '../../../deploy/staging/firebase.mjs';
const root = resolve(process.cwd(), '../..');
test('WhatsApp opt-in exige arquivo privado e ignora credenciais herdadas', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'ramo-otp-')), envFile = resolve(dir, '.env'), keyFile = resolve(dir, 'api-secret');
  const configure = (extra = '') => writeFile(envFile, `OTP_PROVIDER=entrar-whatsapp\nENTRAR_API_SECRET_HOST_FILE=${keyFile}\n${extra}`);
  try {
    await writeFile(envFile, '# Existing config\n'); assert.deepEqual(await stagingOtpConfiguration(envFile), { provider: 'dev' });
    assert.equal((await stagingComposeArguments(envFile)).length, 5);
    await configure(); await assert.rejects(stagingOtpConfiguration(envFile));
    await writeFile(keyFile, 'test-private-api-secret', { mode: 0o600 });
    const otp = await stagingOtpConfiguration(envFile); assert.equal(otp.secret, 'test-private-api-secret');
    assert.ok((await stagingComposeArguments(envFile)).at(-1).endsWith('compose.otp.yml'));
    const inherited = process.env.ENTRAR_API_SECRET;
    try {
      process.env.ENTRAR_API_SECRET = 'wrong-shell-secret';
      assert.equal(stagingComposeEnvironment().ENTRAR_API_SECRET, undefined);
      assert.equal(stagingComposeEnvironment({ provider: 'mock' }, otp).ENTRAR_API_SECRET, otp.secret);
    } finally { if (inherited == null) delete process.env.ENTRAR_API_SECRET; else process.env.ENTRAR_API_SECRET = inherited; }
    for (const mode of [0o644, 0o000]) { await chmod(keyFile, mode); await assert.rejects(stagingOtpConfiguration(envFile)); }
    await chmod(keyFile, 0o600); await writeFile(keyFile, 'PRIVATE SECRET WITH SPACES');
    await assert.rejects(stagingOtpConfiguration(envFile), (e: any) => !e.message.includes('PRIVATE SECRET'));
    const link = resolve(dir, 'link'); await symlink(keyFile, link);
    await writeFile(envFile, `OTP_PROVIDER=entrar-whatsapp\nENTRAR_API_SECRET_HOST_FILE=${link}`); await assert.rejects(stagingOtpConfiguration(envFile));
    await configure('OTP_PROVIDER=dev\n'); await assert.rejects(stagingOtpConfiguration(envFile));
    await writeFile(envFile, 'OTP_PROVIDER=unsupported'); await assert.rejects(stagingOtpConfiguration(envFile));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Compose injeta OTP apenas no Core e preserva limites e modo sem códigos dev', async () => {
  const overlay = await readFile(resolve(root, 'deploy/staging/compose.otp.yml'), 'utf8');
  assert.match(overlay, /OTP_PROVIDER: entrar-whatsapp/); assert.match(overlay, /ENTRAR_API_SECRET: \$\{ENTRAR_API_SECRET:\?/);
  const base = await readFile(resolve(root, 'deploy/staging/compose.yml'), 'utf8'); assert.match(base, /ALLOW_DEV_OTP: "false"/);
  const docker = spawnSync('docker', ['compose', 'version']);
  if (docker.status !== 0) { assert.ok(!process.env.CI, 'CI requires Docker Compose'); return; }
  const result = spawnSync('docker', ['compose', '-f', resolve(root, 'deploy/staging/compose.yml'), '-f', resolve(root, 'deploy/staging/compose.otp.yml'), 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, APP_DOMAIN: 'test.example.com', ACME_EMAIL: 'test@example.com', POSTGRES_PASSWORD: 'x'.repeat(32), DATABASE_URL: 'postgresql://u:p@postgres/db', OTP_HASH_SECRET: 'x'.repeat(32), OTP_RATE_LIMIT_SECRET: 'x'.repeat(32), ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), ADMIN_LOGIN_RATE_LIMIT_SECRET: 'x'.repeat(32), PLACE_PROOF_SECRET: 'x'.repeat(32), DOCUMENT_INSPECTION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), ENTRAR_API_SECRET: 'test-secret' },
  });
  assert.equal(result.status, 0, result.stderr); const services = JSON.parse(result.stdout).services;
  assert.equal(services.core.environment.OTP_PROVIDER, 'entrar-whatsapp'); assert.equal(services.core.environment.ENTRAR_API_SECRET, 'test-secret');
  for (const [name, service] of Object.entries(services) as [string, any][]) if (name !== 'core') assert.equal(service.environment?.ENTRAR_API_SECRET, undefined);
});
