import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../../../deploy/staging/activate-admin-public-path.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');

async function simulate(options = {}) {
  const repo = '/opt/ramo-nessa';
  const backup = '/var/backups/ramo-nessa-administrodo';
  const original = '{$APP_DOMAIN}, app.ramonessa.com.br {\n  redir / /admin/ 302\n  redir /admin /admin/ 308\n  handle_path /admin/* {\n    root * /srv/admin\n  }\n}\n';
  const expected = original.replace('  redir / /admin/ 302\n', '').replace('  redir /admin /admin/ 308', '  redir /administrodo /administrodo/ 308').replace('handle_path /admin/*', 'handle_path /administrodo/*');
  const state = { config: options.changedConfig ? original + '# changed' : original, tag: 'old-image', image: 'old-image', calls: [], exitCode: 0 };
  const files = new Map([
    [backup + '/Caddyfile.before-activation', original],
    [backup + '/Caddyfile.candidate', expected],
    [backup + '/change.patch', 'reviewed patch'],
    [backup + '/image-before.txt', 'old-image\n'],
  ]);
  const process = { exitCode: 0 };
  const sandbox = {
    assert, process,
    console: { log() {}, error() {} },
    readFileSync: path => path === repo + '/deploy/staging/Caddyfile' ? state.config : files.get(path),
    stagingGoogleMapsConfiguration: async () => ({ provider: 'google', apiKey: 'private-map-key' }),
    stagingOtpConfiguration: async () => ({ provider: 'entrar-whatsapp', secret: 'private-otp-key' }),
    stagingComposeArguments: async () => ['compose', '--env-file', repo + '/deploy/staging/.env', '-f', 'compose.yml', '-f', 'compose.firebase.yml', '-f', 'compose.google-maps.yml', '-f', 'compose.otp.yml'],
    stagingComposeEnvironment: (maps, otp) => ({ GOOGLE_MAPS_SERVER_API_KEY: maps.apiKey, ENTRAR_API_SECRET: otp.secret }),
    spawnSync: (command, args, settings) => {
      state.calls.push({ command, args: Array.from(args) });
      const ok = stdout => ({ status: 0, stdout: stdout ?? '' });
      if (command === 'sudo') {
        const git = Array.from(args).slice(5);
        if (git[0] === 'rev-parse') return ok('7f6086763d78f64c65d4939151d728e46f51b6fb\n');
        if (git[0] === 'status') return ok(' M deploy/staging/Caddyfile\n');
        if (git[0] === 'diff') return ok('reviewed patch');
        if (git[0] === 'apply') {
          assert.equal(settings.input, 'reviewed patch');
          if (!git.includes('--check')) state.config = git.includes('--reverse') ? original : expected;
          return ok();
        }
      }
      if (command === 'docker') {
        if (args[0] === 'inspect') return ok(state.image + '\n');
        if (args[0] === 'image' && args[1] === 'inspect') return ok(args.at(-1).endsWith(':staging') ? state.tag + '\n' : 'new-image\n');
        if (args[0] === 'image' && args[1] === 'tag') { state.tag = args[2].includes('administrodo-116dd008') ? 'new-image' : args[2]; return ok(); }
        if (args[0] === 'compose') {
          assert.equal(settings.env.GOOGLE_MAPS_SERVER_API_KEY, 'private-map-key');
          assert.equal(settings.env.ENTRAR_API_SECRET, 'private-otp-key');
          assert.ok(args.includes('compose.google-maps.yml'));
          assert.ok(args.includes('compose.otp.yml'));
          if (args.includes('config')) return options.invalidCompose ? { status: 1 } : ok();
          if (args.includes('--help')) return ok('--wait-timeout');
          assert.equal(args.at(-1), 'gateway');
          for (const flag of ['--no-deps', '--no-build', '--force-recreate', '--wait']) assert.ok(args.includes(flag));
          state.image = state.tag;
          if (options.unhealthy && state.tag === 'new-image') return { status: 1 };
          return ok();
        }
      }
      throw new Error('Unexpected subprocess: ' + command);
    },
  };
  try { await vm.runInNewContext('(async () => {\n' + source + '\n})()', sandbox); }
  catch (error) { state.error = error; }
  state.exitCode = process.exitCode;
  return { state, original, expected };
}

test('activation loads provider credentials and replaces only gateway', async () => {
  const { state, expected } = await simulate();
  assert.equal(state.error, undefined);
  assert.equal(state.exitCode, 0);
  assert.equal(state.config, expected);
  assert.equal(state.image, 'new-image');
});

test('invalid Compose configuration stops before modifying files or images', async () => {
  const { state, original } = await simulate({ invalidCompose: true });
  assert.ok(state.error);
  assert.equal(state.config, original);
  assert.equal(state.image, 'old-image');
  assert.equal(state.calls.some(call => call.args.includes('--force-recreate')), false);
});

test('unhealthy gateway restores source and old image using provider environment', async () => {
  const { state, original } = await simulate({ unhealthy: true });
  assert.equal(state.exitCode, 1);
  assert.equal(state.error, undefined);
  assert.equal(state.config, original);
  assert.equal(state.image, 'old-image');
  assert.equal(state.tag, 'old-image');
});

test('changed active configuration prevents application', async () => {
  const { state, original } = await simulate({ changedConfig: true });
  assert.ok(state.error);
  assert.equal(state.config, original + '# changed');
  assert.equal(state.calls.some(call => call.args.includes('--force-recreate')), false);
});
