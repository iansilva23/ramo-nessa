import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { stagingGoogleMapsConfiguration } from '/opt/ramo-nessa/deploy/staging/google-maps.mjs';
import { stagingOtpConfiguration } from '/opt/ramo-nessa/deploy/staging/otp.mjs';
import { stagingComposeArguments, stagingComposeEnvironment } from '/opt/ramo-nessa/deploy/staging/firebase.mjs';

const repo = '/opt/ramo-nessa';
const backup = '/var/backups/ramo-nessa-administrodo';
const base = '7f6086763d78f64c65d4939151d728e46f51b6fb';
const novo = '116dd0088f0e825f9fa021ccafbccb0eb19a8bbf';
const tag = 'ramo-nessa-admin-gateway:staging';
const candidato = 'ramo-nessa-admin-gateway:administrodo-116dd008';
const ativo = repo + '/deploy/staging/Caddyfile';
const ler = path => readFileSync(path, 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options,
  });
  if (result.error || result.status !== 0) throw new Error('Falha ao executar ' + command);
  return result.stdout ?? '';
}
const git = (args, input) => run('sudo', ['-u', 'ubuntu', 'git', '-C', repo, ...args], { input });

const arquivo = repo + '/deploy/staging/.env';
const maps = await stagingGoogleMapsConfiguration(arquivo);
const otp = await stagingOtpConfiguration(arquivo);
const args = await stagingComposeArguments(arquivo);
args.splice(1, 0, '--project-name', 'ramo-nessa-staging');
const env = stagingComposeEnvironment(maps, otp);
const compose = tail => run('docker', [...args, ...tail], { env });

compose(['config', '--quiet']);
assert.ok(compose(['up', '--help']).includes('--wait-timeout'), 'Compose sem suporte a espera de saude.');
assert.equal(git(['rev-parse', 'HEAD']).trim(), base, 'Versao inesperada.');
assert.equal(git(['status', '--porcelain']), ' M deploy/staging/Caddyfile\n', 'Alteracoes locais inesperadas.');
assert.equal(ler(ativo), ler(backup + '/Caddyfile.before-activation'), 'Configuracao ativa mudou.');
const patch = ler(backup + '/change.patch');
assert.equal(git(['diff', '--binary', base, novo]), patch, 'Patch diferente do revisado.');
git(['apply', '--check', '-'], patch);
let esperado = ler(ativo);
for (const [antes, depois] of [
  ['  redir / /admin/ 302\n', ''],
  ['  redir /admin /admin/ 308', '  redir /administrodo /administrodo/ 308'],
  ['handle_path /admin/*', 'handle_path /administrodo/*'],
]) {
  assert.equal(esperado.split(antes).length, 2, 'Rota inesperada.');
  esperado = esperado.replace(antes, depois);
}
assert.equal(ler(backup + '/Caddyfile.candidate'), esperado, 'Configuracao candidata mudou.');
const anterior = ler(backup + '/image-before.txt').trim();
assert.equal(run('docker', ['inspect', '--format', '{{.Image}}', 'ramo-nessa-staging-gateway-1']).trim(), anterior, 'Imagem ativa mudou.');
assert.equal(run('docker', ['image', 'inspect', '--format', '{{.Id}}', tag]).trim(), anterior, 'Tag ativa mudou.');
run('docker', ['image', 'inspect', '--format', '{{.Id}}', candidato]);

let aplicado = false, iniciou = false;
try {
  git(['apply', '-'], patch);
  aplicado = true;
  assert.equal(ler(ativo), esperado, 'Configuracao aplicada diferente da validada.');
  run('docker', ['image', 'tag', candidato, tag]);
  iniciou = true;
  console.log('Substituindo somente o gateway...');
  compose(['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', '--wait', '--wait-timeout', '60', 'gateway']);
  console.log('NOVO ENDERECO ATIVADO: https://app.ramonessa.com.br/administrodo/');
} catch {
  console.error('Ativacao falhou. Recuperando a versao anterior...');
  try {
    if (aplicado) {
      git(['apply', '--reverse', '--check', '-'], patch);
      git(['apply', '--reverse', '-'], patch);
    }
    run('docker', ['image', 'tag', anterior, tag]);
    if (iniciou) compose(['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', '--wait', '--wait-timeout', '60', 'gateway']);
    console.error('Configuracao e imagem anteriores restauradas.');
  } catch {
    console.error('Recuperacao incompleta. Envie o resultado antes de executar outros comandos.');
  }
  process.exitCode = 1;
}
