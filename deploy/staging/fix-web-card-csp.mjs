// Scoped Secure Fields preflight connection repair. No bundle, Core or payment writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, lstatSync, mkdirSync, rmSync, openSync, closeSync, fsyncSync, fstatSync, ftruncateSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const deniedPolicy = 'camera=(), microphone=(), geolocation=()';
export const allowedPolicy = 'camera=(), microphone=(), geolocation=(self)';
const gatewayName = 'ramo-nessa-staging-gateway-1';
const configPath = '/etc/caddy/Caddyfile';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export const secureFieldOrigins = ['https://secure-fields.mercadopago.com', 'https://api-static.mercadopago.com'];
export function patchConnectPolicy(policy) {
  const directives=policy.split(';').map(s=>s.trim()).filter(Boolean);
  assert.equal(directives.filter(s=>s.split(/\s+/)[0]==='connect-src').length,1,'Diretiva de conexões diferente do esperado.');
  const tokens=directives.find(s=>s.startsWith('connect-src ')).split(/\s+/).slice(1);
  assert(tokens.includes("'self'")&&tokens.includes('https://api.mercadopago.com'),'Política de cartão diferente do esperado.');
  const missing=secureFieldOrigins.filter(origin=>!tokens.includes(origin));
  return missing.length?policy.replace(/connect-src\s+/, 'connect-src '+missing.join(' ')+' '):policy;
}
export function passengerPolicy(source) {
  const marker='  handle_path /passageiro/* {';
  assert.equal(source.split(marker).length,2,'Bloco do Passageiro mudou.');
  const start=source.indexOf(marker),end=source.indexOf('\n  }',start);
  assert(end>start,'Bloco do Passageiro não encontrado.');
  const block=source.slice(start,end);
  const matches=[...block.matchAll(/header Content-Security-Policy "([^"]+)"/g)];
  assert.equal(matches.length,1,'Política do Passageiro diferente do esperado.');
  return {start,end,block,policy:matches[0][1]};
}
export function patchCardPolicy(source) {
  const {start,end,block,policy}=passengerPolicy(source);
  const next=patchConnectPolicy(policy);
  return source.slice(0,start)+block.replace('"'+policy+'"','"'+next+'"')+source.slice(end);
}

export function fixtureConfig(adapted) {
  const servers = Object.values(adapted.apps?.http?.servers ?? {});
  const appServer = servers.find(server => JSON.stringify(server.routes).includes('app.ramonessa.com.br'));
  assert(appServer, 'Servidor HTTPS do app não encontrado.');
  // Actual adapted routes, real bundles, no TLS/ACME and no network access.
  return { admin: { disabled: true }, apps: { http: { servers: {
    card_csp_test: { listen: [':18080'], routes: appServer.routes, automatic_https: { disable: true } },
  } } } };
}

export function assertGateway(gateway) {
  assert(gateway.State?.Running && !gateway.State?.Paused, 'Gateway indisponível.');
  assert.equal(gateway.State.Health?.Status, 'healthy', 'Gateway sem saúde confirmada.');
  assert.equal(gateway.Path, 'caddy', 'Processo do gateway mudou.');
  assert.equal(gateway.Args?.[0], 'run', 'Modo de inicialização do gateway mudou.');
  assert(!gateway.Args.includes('--resume'), 'Gateway usa configuração por API.');
  const offset = gateway.Args.indexOf('--config');
  assert(offset >= 0 && gateway.Args[offset + 1] === configPath, 'Arquivo de inicialização mudou.');
  const mount = gateway.Mounts?.find(value => value.Destination === configPath);
  assert(mount?.Type === 'bind' && mount.Source?.startsWith('/'), 'Mount do Caddyfile não confirmado.');
  return mount.Source;
}

export function writeInPlace(path, bytes, expected) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), 'Caddyfile deve ser arquivo regular.');
  assert.equal(hash(readFileSync(path)), expected, 'Caddyfile mudou durante a operação.');
  const fd = openSync(path, 'r+');
  try {
    assert.equal(fstatSync(fd).ino, stat.ino, 'Caddyfile foi substituído.');
    // Preserve the inode used by the running bind mount.
    writeFileSync(fd, bytes);
    // A shorter rollback is truncated only after the original bytes are written.
    if (fstatSync(fd).size !== bytes.length) {
      ftruncateSync(fd, bytes.length);
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

export async function repairCardPolicy() {
  assert.equal(process.getuid?.(), 0, 'Execute com sudo.');
  const lock = '/var/lock/ramo-web-card-csp-policy.lock';
  mkdirSync(lock, { mode: 0o700 });
  let root, changed = false, oldBytes, newBytes, active, testName;
  function run(args, input) {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45000, maxBuffer: 32 * 1024 ** 2 });
    if (result.error || result.status !== 0) {
      if (root) writeFileSync(join(root, 'command.private.log'), String(result.stdout ?? '') + String(result.stderr ?? ''), { mode: 0o600 });
      throw Error('Etapa Docker interrompida: ' + args.slice(0, 2).join(' '));
    }
    return result.stdout;
  }
  const inspect = name => JSON.parse(run(['inspect', name]))[0];
  const request = async (path, expectedStatus = 200) => {
    const response = await fetch('https://app.ramonessa.com.br' + path + '?card_check=' + Date.now(), { redirect: 'manual', signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, expectedStatus, 'Resposta HTTPS inesperada: ' + path);
    return { status: response.status, policy: response.headers.get('permissions-policy'), csp: response.headers.get('content-security-policy'), bodyHash: hash(body) };
  };
  const paths = ['/motorista/', '/passageiro/', '/administrodo/', '/ready'];
  async function checkPublic(expectedCsp, before) {
    const values = await Promise.all(paths.map(path => request(path)));
    for (let index = 0; index < values.length; index++) {
      assert.equal(values[index].policy, index < 2 ? allowedPolicy : deniedPolicy, 'Política HTTPS inesperada: ' + paths[index]);
      if(index===1)assert.equal(values[index].csp,expectedCsp,'Política HTTPS do cartão diferente do candidato.');
      if(before&&index!==1)assert.equal(values[index].csp,before[index].csp,'Política de outro serviço mudou.');
      if (before && index < 3) assert.equal(values[index].bodyHash, before[index].bodyHash, 'Conteúdo Web mudou: ' + paths[index]);
    }
    return values;
  }
  try {
    const gateway = inspect(gatewayName);
    active = assertGateway(gateway);
    assert(lstatSync(active).isFile() && !lstatSync(active).isSymbolicLink(), 'Caddyfile não é arquivo regular.');
    oldBytes = readFileSync(active);
    assert.equal(hash(run(['exec', gatewayName, 'cat', configPath])), hash(oldBytes), 'Mount não corresponde ao arquivo ativo.');
    newBytes = Buffer.from(patchCardPolicy(oldBytes.toString('utf8')));
    const oldCsp=passengerPolicy(oldBytes.toString('utf8')).policy,newCsp=passengerPolicy(newBytes.toString('utf8')).policy;
    if (newBytes.equals(oldBytes)) {
      await checkPublic(newCsp);
      console.log(JSON.stringify({ status: 'CARTAO_WEB_JA_LIBERADO', servicesRestarted: false }));
      return;
    }
    root = '/var/backups/ramo-web-card-csp-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
    mkdirSync(root, { mode: 0o700 });
    writeFileSync(join(root, 'Caddyfile.before'), oldBytes, { mode: 0o600 });
    writeFileSync(join(root, 'Caddyfile.candidate'), newBytes, { mode: 0o600 });
    const protectedNames = ['ramo-nessa-staging-core-1', 'ramo-nessa-staging-postgres-1', 'ramo-nessa-site-institutional-site-1'];
    const protectedState = protectedNames.map(name => {
      const value = inspect(name);
      assert(value.State?.Running&&(!value.State.Health||value.State.Health.Status==='healthy'), 'Serviço indisponível: '+name);
      return { name, id: value.Id, startedAt: value.State.StartedAt, image: value.Image };
    });
    const assertPreserved = () => {
      for (const before of protectedState) {
        const after = inspect(before.name);
        assert.equal(after.Id, before.id, 'Container protegido mudou.');
        assert.equal(after.State.StartedAt, before.startedAt, 'Serviço protegido reiniciou.');
        assert.equal(after.Image, before.image, 'Imagem protegida mudou.');
      }
      const after = inspect(gatewayName);
      assert.equal(after.Id, gateway.Id, 'Gateway foi substituído.');
      assert.equal(after.State.StartedAt, gateway.State.StartedAt, 'Gateway reiniciou.');
      assert.equal(assertGateway(after), active, 'Mount do gateway mudou.');
    };
    const beforePublic = await checkPublic(oldCsp);
    const version = run(['exec', gatewayName, 'caddy', 'version']);
    const parsed = /^v(\d+)\.(\d+)\./.exec(version);
    assert(parsed && Number(parsed[1]) === 2 && Number(parsed[2]) >= 11, 'Versão do Caddy sem recarga por sinal validada.');
    console.log('Validando candidato com o Caddy da VPS, antes de alterar o arquivo ativo...');
    run(['exec', '-i', gatewayName, 'caddy', 'validate', '--config', '-', '--adapter', 'caddyfile'], newBytes);
    const adapt = bytes => JSON.parse(run(['exec', '-i', gatewayName, 'caddy', 'adapt', '--config', '-', '--adapter', 'caddyfile'], bytes));
    const baseline = adapt(oldBytes), candidate = adapt(newBytes);
    assert.equal(baseline.admin?.disabled, true, 'Admin do Caddy mudou.');
    assert.equal(candidate.admin?.disabled, true, 'Admin do candidato mudou.');
    async function rehearse(adapted, expectedCsp) {
      const name = 'ramo-card-policy-test-' + process.pid;
      const file = join(root, 'test.json');
      writeFileSync(file, JSON.stringify(fixtureConfig(adapted)), { mode: 0o600 });
      const args = ['run', '-d', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--no-healthcheck', '--tmpfs', '/config', '--tmpfs', '/data', '--mount', 'type=bind,src=' + file + ',dst=/etc/caddy/test.json,readonly'];
      for (const destination of ['/srv/web', '/srv/admin']) {
        const mount = gateway.Mounts.find(value => value.Destination === destination);
        if (mount) {
          assert.equal(mount.Type, 'bind', 'Mount de arquivos mudou.');
          args.push('--mount', 'type=bind,src=' + mount.Source + ',dst=' + destination + ',readonly');
        }
      }
      args.push('--entrypoint', 'caddy', gateway.Image, 'run', '--config', '/etc/caddy/test.json');
      testName = name;
      run(args);
      try {
        for (const path of paths.slice(0, 3)) {
          let output;
          for (let attempt = 0; attempt < 10; attempt++) {
            const result = spawnSync('docker', ['exec', name, 'wget', '-S', '-O', '/dev/null', '--header', 'Host: app.ramonessa.com.br', 'http://127.0.0.1:18080' + path], { encoding: 'utf8', timeout: 8000 });
            if (result.status === 0) { output = result.stdout + result.stderr; break; }
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          assert(output, 'Ensaio HTTP não respondeu: ' + path);
          const policies = [...output.matchAll(/^\s*Permissions-Policy:\s*([^\r\n]+)/gmi)].map(value => value[1].trim());
          assert.deepEqual(policies, [path === '/administrodo/' ? deniedPolicy : allowedPolicy], 'Ensaio HTTP de GPS falhou: ' + path);
          if(path==='/passageiro/'){const csps=[...output.matchAll(/^\s*Content-Security-Policy:\s*([^\r\n]+)/gmi)].map(v=>v[1].trim());assert.deepEqual(csps,[expectedCsp],'Ensaio HTTP do cartão falhou.');}
        }
      } finally { run(['rm', '-f', name]); testName = null; }
    }
    console.log('Testando as políticas anterior e corrigida em container isolado...');
    await rehearse(baseline, oldCsp);
    await rehearse(candidate, newCsp);
    assertPreserved();
    assert.equal(hash(readFileSync(active)), hash(oldBytes), 'Arquivo ativo mudou após o ensaio.');
    assert.equal(hash(run(['exec', gatewayName, 'cat', configPath])), hash(oldBytes), 'Mount mudou após o ensaio.');
    console.log('Liberando a inicialização dos campos seguros e recarregando o gateway...');
    changed = true;
    writeInPlace(active, newBytes, hash(oldBytes));
    assert.equal(hash(run(['exec', gatewayName, 'cat', configPath])), hash(newBytes), 'Candidato não está visível no gateway.');
    run(['kill', '--signal=USR1', gatewayName]);
    let checked;
    for (let attempt = 0; attempt < 12; attempt++) {
      try { checked = await checkPublic(newCsp, beforePublic); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert(checked, 'Conferência HTTPS falhou após recarga.');
    assertPreserved();
    const result = { status: 'CARTAO_WEB_LIBERADO', passengerPolicy: checked[1].policy, driverPolicy: checked[0].policy, adminPolicy: checked[2].policy, isolatedHttpTestsPassed: true, servicesRestarted: false, corePreserved: true, databaseChanged: false, webBundlesChanged: false, paymentConfigurationChanged: false, deviceAcceptancePending: true, backup: root };
    writeFileSync(join(root, 'completed.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    changed = false;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (changed) {
      try {
        writeInPlace(active, oldBytes, hash(newBytes));
        run(['kill', '--signal=USR1', gatewayName]);
        let restored = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          try { await checkPublic(passengerPolicy(oldBytes.toString('utf8')).policy); restored = true; break; }
          catch { await new Promise(resolve => setTimeout(resolve, 500)); }
        }
        assert(restored, 'Retorno HTTPS não confirmado.');
        console.error('Configuração anterior restaurada e conferida por HTTPS.');
      } catch { console.error('Retorno automático não confirmado. Preserve o backup: ' + root); }
    }
    throw error;
  } finally {
    if (testName) { try { run(['rm', '-f', testName]); } catch {} }
    rmSync(lock, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply') {
    console.error('Uso: sudo node fix-web-card-csp.mjs --apply');
    process.exitCode = 1;
  } else repairCardPolicy().catch(error => {
    console.error('Correção interrompida: '+error.message+' Envie esta saída; não repita comandos.');
    process.exitCode = 1;
  });
}
