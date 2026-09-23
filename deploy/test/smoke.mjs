import { createHmac } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { ensureTestEnvironment } from './env.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const composeFile = resolve(here, 'compose.yml');
const envFile = resolve(here, `.env.smoke-${process.pid}`);
const project = `ramo-nessa-smoke-${process.pid}`;
const port = 18080;
const baseUrl = `http://127.0.0.1:${port}`;

function compose(args, options = {}) {
  return spawnSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '--env-file',
      envFile,
      '-f',
      composeFile,
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_HTTP_PORT: String(port),
      },
      ...options,
    },
  );
}

function requireOk(result, label) {
  if (result.status === 0) return;
  const detail = (result.stderr || result.stdout || '').trim();
  throw new Error(`${label} falhou. ${detail}`);
}

async function waitForReady() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/ready`, {
        cache: 'no-store',
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, 1000),
    );
  }
  throw new Error('Core não ficou ready dentro de 120 segundos.');
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/=+$/g, '');
  let bits = 0;
  let buffer = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Segredo TOTP Base32 inválido.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secretBase32, now = new Date()) {
  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(now.getTime() / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret)
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store',
    redirect: 'error',
    ...options,
  });
  let payload = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  }
  return { response, payload };
}

await ensureTestEnvironment(envFile, {
  force: true,
  port,
});

try {
  compose(['down', '-v', '--remove-orphans']);

  const up = compose(['up', '-d', '--build']);
  requireOk(up, 'docker compose up');
  await waitForReady();

  const adminPage = await fetch(`${baseUrl}/admin/`, {
    cache: 'no-store',
  });
  if (!adminPage.ok) {
    throw new Error(`Admin web retornou HTTP ${adminPage.status}.`);
  }
  const adminHtml = await adminPage.text();
  if (!adminHtml.includes('Ramo Nessa — Admin')) {
    throw new Error('HTML do Admin não corresponde ao painel esperado.');
  }
  const csp =
    adminPage.headers.get('content-security-policy') ?? '';
  if (
    !csp.includes("connect-src 'self'") ||
    !csp.includes("frame-ancestors 'none'")
  ) {
    throw new Error('CSP do gateway administrativo está incompleta.');
  }

  const create = compose([
    'exec',
    '-T',
    'core',
    'node',
    'dist/scripts/create-admin-user.js',
    '--name=CI Smoke Admin',
    '--email=ci-smoke@ramonessa.local',
  ]);
  requireOk(create, 'bootstrap do usuário Admin');

  let credentials;
  try {
    credentials = JSON.parse(create.stdout);
  } catch {
    throw new Error('Bootstrap Admin não retornou JSON válido.');
  }
  if (
    typeof credentials.initialPassword !== 'string' ||
    typeof credentials.totpSecret !== 'string'
  ) {
    throw new Error('Bootstrap Admin não retornou credenciais iniciais.');
  }

  const login = await jsonRequest('/v1/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'ci-smoke@ramonessa.local',
      password: credentials.initialPassword,
      totpCode: totpCode(credentials.totpSecret),
    }),
  });
  if (
    login.response.status !== 200 ||
    !login.payload?.accessToken?.startsWith('rn_admin_session_')
  ) {
    throw new Error(
      `Login Admin falhou: HTTP ${login.response.status}.`,
    );
  }
  const token = login.payload.accessToken;
  const authHeaders = {
    authorization: `Bearer ${token}`,
  };

  const me = await jsonRequest('/v1/admin/auth/me', {
    headers: authHeaders,
  });
  if (
    me.response.status !== 200 ||
    me.payload?.user?.email !== 'ci-smoke@ramonessa.local'
  ) {
    throw new Error('Sessão Admin não foi validada por /me.');
  }

  const driverId = 'driver-smoke-admin-001';
  const provision = await jsonRequest(
    `/v1/admin/drivers/${driverId}/auth`,
    {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        phone: '88999991279',
        status: 'suspended',
      }),
    },
  );
  if (
    provision.response.status !== 201 ||
    provision.payload?.status !== 'suspended' ||
    provision.payload?.created !== true
  ) {
    throw new Error('Provisionamento Admin do motorista falhou.');
  }

  const approve = await jsonRequest(
    `/v1/admin/drivers/${driverId}/auth/status`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'active' }),
    },
  );
  if (
    approve.response.status !== 200 ||
    approve.payload?.status !== 'active'
  ) {
    throw new Error('Aprovação Admin do motorista falhou.');
  }

  const driver = await jsonRequest(
    `/v1/admin/drivers/${driverId}/auth`,
    { headers: authHeaders },
  );
  if (
    driver.response.status !== 200 ||
    driver.payload?.status !== 'active'
  ) {
    throw new Error('Consulta Admin do motorista falhou.');
  }

  const directory = await jsonRequest(
    '/v1/admin/drivers?limit=20&query=driver-smoke',
    { headers: authHeaders },
  );
  if (
    directory.response.status !== 200 ||
    !Array.isArray(directory.payload?.items) ||
    !directory.payload.items.some(
      (item) =>
        item.driverId === driverId &&
        item.status === 'active',
    ) ||
    Number(directory.payload?.summary?.total ?? 0) < 1 ||
    Number(directory.payload?.summary?.active ?? 0) < 1
  ) {
    throw new Error(
      'Diretório administrativo de motoristas não foi confirmado.',
    );
  }

  const audit = await jsonRequest('/v1/admin/audit?limit=20', {
    headers: authHeaders,
  });
  const matchingAudit = audit.payload?.entries?.filter(
    (entry) => entry.targetId === driverId,
  );
  if (
    audit.response.status !== 200 ||
    !Array.isArray(matchingAudit) ||
    matchingAudit.length < 2 ||
    matchingAudit.some((entry) => entry.actor?.kind !== 'user')
  ) {
    throw new Error('Auditoria humana do Admin não foi confirmada.');
  }

  const logout = await fetch(
    `${baseUrl}/v1/admin/auth/session`,
    {
      method: 'DELETE',
      headers: authHeaders,
      cache: 'no-store',
    },
  );
  if (logout.status !== 204) {
    throw new Error(`Logout Admin retornou HTTP ${logout.status}.`);
  }

  const afterLogout = await fetch(
    `${baseUrl}/v1/admin/auth/me`,
    {
      headers: authHeaders,
      cache: 'no-store',
    },
  );
  if (afterLogout.status !== 401) {
    throw new Error(
      'Token Admin continuou válido depois do logout.',
    );
  }

  console.log(
    'Smoke E2E aprovado: gateway, Admin, MFA, diretório de motoristas, auditoria e logout.',
  );
} finally {
  const down = compose(['down', '-v', '--remove-orphans']);
  if (down.status !== 0) {
    process.stderr.write(down.stderr || down.stdout || '');
  }
  await rm(envFile, { force: true });
}
