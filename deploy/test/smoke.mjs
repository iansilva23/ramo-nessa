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

  const createStorageKey = compose([
    'exec',
    '-T',
    'core',
    'node',
    'dist/scripts/create-admin-api-key.js',
    '--name=CI Document Storage',
    '--scopes=drivers:documents:write',
    '--days=1',
  ]);
  requireOk(
    createStorageKey,
    'bootstrap da API key de documentos',
  );
  let documentApiKey;
  try {
    documentApiKey = JSON.parse(createStorageKey.stdout).token;
  } catch {
    throw new Error(
      'Bootstrap da API key de documentos não retornou JSON válido.',
    );
  }
  if (
    typeof documentApiKey !== 'string' ||
    !documentApiKey.startsWith('rn_admin_')
  ) {
    throw new Error(
      'Bootstrap da API key de documentos não retornou token válido.',
    );
  }
  const documentStorageHeaders = {
    authorization: `Bearer ${documentApiKey}`,
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

  const passengerOtp = await jsonRequest(
    '/v1/auth/otp/request',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-instance-id': 'ci-smoke-passenger',
      },
      body: JSON.stringify({
        subjectType: 'passenger',
        phone: '88999991278',
      }),
    },
  );
  if (passengerOtp.response.status !== 202) {
    throw new Error(
      `Criação OTP do passageiro falhou: HTTP ${passengerOtp.response.status}.`,
    );
  }

  const passengerDirectory = await jsonRequest(
    '/v1/admin/passengers?limit=20&query=91278',
    { headers: authHeaders },
  );
  if (
    passengerDirectory.response.status !== 200 ||
    !Array.isArray(passengerDirectory.payload?.items) ||
    !passengerDirectory.payload.items.some(
      (item) =>
        item.phoneE164 === '+5588999991278' &&
        item.status === 'active',
    ) ||
    Number(passengerDirectory.payload?.summary?.total ?? 0) < 1 ||
    Number(passengerDirectory.payload?.summary?.active ?? 0) < 1
  ) {
    throw new Error(
      'Diretório administrativo de passageiros não foi confirmado.',
    );
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

  const registryCreate = await jsonRequest(
    `/v1/admin/drivers/${driverId}/registry`,
    {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Motorista Smoke Ramo Nessa',
        preferredName: 'Motorista Smoke',
        vehicle: {
          plate: 'SMK1A23',
          make: 'Toyota',
          model: 'Hilux',
          modelYear: 2024,
          color: 'Branca',
          categories: ['car', 'comfort_black'],
          fourByFour: true,
          seatCapacity: 4,
        },
      }),
    },
  );
  if (
    registryCreate.response.status !== 200 ||
    registryCreate.payload?.profile?.status !== 'pending' ||
    registryCreate.payload?.vehicle?.status !== 'pending' ||
    registryCreate.payload?.registryApproved !== false
  ) {
    throw new Error(
      'Cadastro administrativo de perfil/veículo não foi confirmado.',
    );
  }

  const registryApprove = await jsonRequest(
    `/v1/admin/drivers/${driverId}/registry/status`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        profileStatus: 'approved',
        vehicleStatus: 'approved',
      }),
    },
  );
  if (
    registryApprove.response.status !== 200 ||
    registryApprove.payload?.registryApproved !== true
  ) {
    throw new Error(
      'Aprovação administrativa de perfil/veículo falhou.',
    );
  }

  const registryRead = await jsonRequest(
    `/v1/admin/drivers/${driverId}/registry`,
    { headers: authHeaders },
  );
  if (
    registryRead.response.status !== 200 ||
    registryRead.payload?.profile?.fullName !==
      'Motorista Smoke Ramo Nessa' ||
    registryRead.payload?.vehicle?.plateNormalized !== 'SMK1A23' ||
    registryRead.payload?.registryApproved !== true
  ) {
    throw new Error(
      'Consulta administrativa de perfil/veículo falhou.',
    );
  }

  for (const document of [
    {
      type: 'driver_license',
      storageKey: `drivers/${driverId}/documents/cnh-smoke.pdf`,
      sha: 'd'.repeat(64),
    },
    {
      type: 'vehicle_registration',
      storageKey: `drivers/${driverId}/documents/crlv-smoke.pdf`,
      sha: 'e'.repeat(64),
    },
  ]) {
    const submittedDocument = await jsonRequest(
      `/v1/admin/drivers/${driverId}/documents/${document.type}`,
      {
        method: 'PUT',
        headers: {
          ...documentStorageHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          storageKey: document.storageKey,
          contentSha256: document.sha,
          mimeType: 'application/pdf',
          sizeBytes: 125000,
          expiresOn: '2027-12-31',
        }),
      },
    );
    if (
      submittedDocument.response.status !== 201 ||
      submittedDocument.payload?.status !== 'pending' ||
      'storageKey' in (submittedDocument.payload ?? {}) ||
      'contentSha256' in (submittedDocument.payload ?? {})
    ) {
      throw new Error(
        `Submissão segura de ${document.type} não foi confirmada.`,
      );
    }

    const reviewedDocument = await jsonRequest(
      `/v1/admin/drivers/${driverId}/documents/${document.type}/review`,
      {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      },
    );
    if (
      reviewedDocument.response.status !== 200 ||
      reviewedDocument.payload?.status !== 'approved'
    ) {
      throw new Error(
        `Aprovação de ${document.type} não foi confirmada.`,
      );
    }
  }

  const documents = await jsonRequest(
    `/v1/admin/drivers/${driverId}/documents`,
    { headers: authHeaders },
  );
  if (
    documents.response.status !== 200 ||
    documents.payload?.documentsApproved !== true ||
    !Array.isArray(documents.payload?.items) ||
    documents.payload.items.length !== 2 ||
    documents.payload.items.some(
      (item) =>
        'storageKey' in item ||
        'contentSha256' in item ||
        item.effectiveStatus !== 'approved',
    )
  ) {
    throw new Error(
      'Consulta segura dos documentos do motorista falhou.',
    );
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

  const ridesDirectory = await jsonRequest(
    '/v1/admin/rides?scope=active&limit=20',
    { headers: authHeaders },
  );
  if (
    ridesDirectory.response.status !== 200 ||
    !Array.isArray(ridesDirectory.payload?.items) ||
    !(
      ridesDirectory.payload?.nextCursor == null ||
      typeof ridesDirectory.payload.nextCursor === 'string'
    )
  ) {
    throw new Error(
      'Diretório administrativo de viagens não foi confirmado.',
    );
  }

  const missingRide = await jsonRequest(
    '/v1/admin/rides/99999999-9999-4999-8999-999999999999',
    { headers: authHeaders },
  );
  if (
    missingRide.response.status !== 404 ||
    missingRide.payload?.error !== 'RIDE_NOT_FOUND'
  ) {
    throw new Error(
      'Detalhe administrativo de viagem não tratou 404 corretamente.',
    );
  }

  const dashboard = await jsonRequest(
    '/v1/admin/dashboard',
    { headers: authHeaders },
  );
  if (
    dashboard.response.status !== 200 ||
    typeof dashboard.payload?.rides?.active !== 'number' ||
    typeof dashboard.payload?.rides?.searchingDriver !== 'number' ||
    typeof dashboard.payload?.rides?.driverOnTheWay !== 'number' ||
    typeof dashboard.payload?.rides?.inProgress !== 'number' ||
    typeof dashboard.payload?.rides?.completedLast24h !== 'number' ||
    typeof dashboard.payload?.rides?.cancelledLast24h !== 'number' ||
    !Array.isArray(dashboard.payload?.activeRides) ||
    dashboard.payload?.window?.kind !== 'last_24h'
  ) {
    throw new Error(
      'Dashboard operacional administrativo não foi confirmado.',
    );
  }

  const pricingCatalog = await jsonRequest(
    '/v1/admin/pricing/catalog',
    { headers: authHeaders },
  );
  if (
    pricingCatalog.response.status !== 200 ||
    pricingCatalog.payload?.catalogVersion !== 'v1' ||
    pricingCatalog.payload?.authority !== 'core' ||
    pricingCatalog.payload?.mode !== 'static' ||
    pricingCatalog.payload?.editable !== false ||
    pricingCatalog.payload?.commissionBps !== 1000 ||
    !Array.isArray(pricingCatalog.payload?.localities?.prea) ||
    !Array.isArray(pricingCatalog.payload?.localities?.jijoca) ||
    !Array.isArray(pricingCatalog.payload?.fixedRoutes) ||
    !pricingCatalog.payload.fixedRoutes.some(
      (route) =>
        route.id === 'prea-jijoca-car' &&
        route.dayCents === 12000 &&
        route.after22Cents === 14000,
    )
  ) {
    throw new Error(
      'Catálogo administrativo read-only de preços não foi confirmado.',
    );
  }

  const audit = await jsonRequest('/v1/admin/audit?limit=20', {
    headers: authHeaders,
  });
  const matchingAudit = audit.payload?.entries?.filter(
    (entry) => entry.targetId === driverId,
  );
  const documentSubmissionAudit = matchingAudit?.filter(
    (entry) => entry.action === 'driver.document.submitted',
  );
  const documentReviewAudit = matchingAudit?.filter(
    (entry) => entry.action === 'driver.document.reviewed',
  );
  const humanOperationalAudit = matchingAudit?.filter(
    (entry) => entry.action !== 'driver.document.submitted',
  );
  if (
    audit.response.status !== 200 ||
    !Array.isArray(matchingAudit) ||
    matchingAudit.length < 8 ||
    documentSubmissionAudit?.length !== 2 ||
    documentSubmissionAudit.some(
      (entry) => entry.actor?.kind !== 'api_key',
    ) ||
    documentReviewAudit?.length !== 2 ||
    documentReviewAudit.some(
      (entry) => entry.actor?.kind !== 'user',
    ) ||
    humanOperationalAudit?.some(
      (entry) => entry.actor?.kind !== 'user',
    )
  ) {
    throw new Error(
      'Auditoria Admin não preservou atores humanos e de storage.',
    );
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
    'Smoke E2E aprovado: gateway, Admin, MFA, cadastro motorista/veículo, documentos privados, diretórios, viagens, dashboard operacional, preços read-only, auditoria e logout.',
  );
} finally {
  const down = compose(['down', '-v', '--remove-orphans']);
  if (down.status !== 0) {
    process.stderr.write(down.stderr || down.stdout || '');
  }
  await rm(envFile, { force: true });
}
