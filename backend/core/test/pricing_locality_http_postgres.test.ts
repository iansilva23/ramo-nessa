import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { issueAdminApiKey } from '../src/admin/admin-auth.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const url = process.env.RAMO_V5_ATOMIC_PG_URL;
const enabled = process.env.RAMO_V5_EPHEMERAL_PG === 'true' && Boolean(url);
const PORT = 18765;
const ROOT = new URL('../', import.meta.url);
const baseUrl = 'http://127.0.0.1:' + PORT;

function localDatabaseUrl(): string {
  if (!enabled || !url) throw new Error('CI PostgreSQL not configured.');
  const db = new URL(url);
  if (
    db.protocol !== 'postgresql:' ||
    db.hostname !== '127.0.0.1' ||
    db.port !== '5432' ||
    db.pathname !== '/ramo_v5_ci'
  ) {
    throw new Error('Refusing to contact a non-disposable database.');
  }
  return db.toString();
}

async function waitForReady(processHandle: ReturnType<typeof spawn>, logs: () => string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode != null) {
      throw new Error('Local Core exited before readiness: ' + logs());
    }
    try {
      const ready = await fetch(baseUrl + '/ready', {
        signal: AbortSignal.timeout(1000),
      });
      if (ready.ok) {
        const json = await ready.json() as { storageMode?: string };
        assert.equal(json.storageMode, 'postgres');
        return;
      }
    } catch {
      // The Core has not started its HTTP listener yet.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Local Core did not become ready: ' + logs());
}

test('localhost HTTP pricing API: writer persists one batch, reader is denied and stale updates conflict', {
  skip: !enabled,
  timeout: 45_000,
}, async () => {
  const database = localDatabaseUrl();
  const pool = createPostgresPool(database);
  const admin = new PostgresAdminRepository(pool);
  const writer = await issueAdminApiKey({
    repository: admin,
    name: 'Local HTTP Writer CI',
    scopes: ['pricing:read', 'pricing:write'],
  });
  const reader = await issueAdminApiKey({
    repository: admin,
    name: 'Local HTTP Reader CI',
    scopes: ['pricing:read'],
  });
  const local = randomUUID().slice(0, 8);
  let draftId = '';
  let browserDraftId = '';
  const headers = (token: string) => ({
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
  });
  const request = async (
    method: string,
    path: string,
    token?: string,
    data?: Record<string, unknown>,
  ) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: token ? headers(token) : { 'content-type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const output: string[] = [];
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: fileURLToPath(ROOT),
    env: {
      ...process.env,
      DATABASE_URL: database,
      PORT: String(PORT),
      NODE_ENV: 'test',
      ROUTING_PROVIDER: 'google',
      GOOGLE_MAPS_SERVER_API_KEY: '',
      GOOGLE_PLACES_API_KEY: '',
      GEO_CATALOG_SEARCH_ENABLED: 'false',
      GEO_PASSENGER_LEARNING_ENABLED: 'false',
      GEO_STORAGE_AUTOMATION_ENABLED: 'false',
      MERCADO_PAGO_MODE: 'disabled',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk: Buffer) => {
    if (output.join('').length < 16_000) output.push(chunk.toString());
  };
  server.stdout?.on('data', collect);
  server.stderr?.on('data', collect);

  try {
    await waitForReady(server, () => output.join('').slice(-5000));
    const noAuth = await request('POST', '/v1/admin/pricing/versions', undefined, {});
    assert.equal(noAuth.status, 401);

    const readonlyCreate = await request(
      'POST', '/v1/admin/pricing/versions', reader.token, {},
    );
    assert.equal(readonlyCreate.status, 403);

    const created = await request(
      'POST', '/v1/admin/pricing/versions', writer.token, {},
    );
    assert.equal(created.status, 201);
    draftId = created.body.id as string;
    assert.match(draftId, /^[a-f0-9-]{36}$/);
    const initialUpdatedAt = created.body.updatedAt as string;
    const path = '/v1/admin/pricing/versions/' + draftId;
    const changes = [
      { kind: 'locality_structure', scope: 'prea',
        localityId: 'ci-http-' + local, operation: 'add' },
      { kind: 'locality_label', scope: 'prea',
        localityId: 'ci-http-' + local, label: 'CI API TESTE' },
      { kind: 'locality_geofence', operation: 'upsert', zoneId: 'prea',
        localityId: 'ci-http-' + local, centerLatitude: -2.820179,
        centerLongitude: -40.414678, radiusKm: 2 },
      { kind: 'locality_price', hub: 'prea',
        localityId: 'ci-http-' + local,
        category: 'moto', price: { kind: 'exact', amountCents: 1200 } },
      { kind: 'locality_policy', hub: 'prea',
        localityId: 'ci-http-' + local,
        enabledCategories: ['moto'], applyNightSurcharge: false },
    ];
    const deniedWrite = await request(
      'PATCH', path, reader.token,
      { kind: 'batch', expectedUpdatedAt: initialUpdatedAt, patches: changes },
    );
    assert.equal(deniedWrite.status, 403);

    const updated = await request(
      'PATCH', path, writer.token,
      { kind: 'batch', expectedUpdatedAt: initialUpdatedAt, patches: changes },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.version.status, 'draft');

    const fetched = await request('GET', path, reader.token);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.version.status, 'draft');
    assert.equal(
      fetched.body.catalog.localityDisplayNames.prea['ci-http-' + local],
      'CI API TESTE',
    );
    assert.equal(fetched.body.catalog.localities.prea.find(
      (row: { localityId: string }) => row.localityId === 'ci-http-' + local,
    )?.prices.moto.amountCents, 1200);

    // Exercise the exact browser/Admin API adapter over real localhost HTTP.
    // The JavaScript client is imported by a separate Node process so the
    // backend's strict TypeScript compilation stays independent of frontend JS.
    const frontendResult = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('../../../scripts/web/admin_api_live_contract.mjs', import.meta.url))],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          RAMO_V5_LOCAL_CORE_URL: baseUrl,
          RAMO_V5_READ_TOKEN: reader.token,
          RAMO_V5_DRAFT_ID: draftId,
          RAMO_V5_LOCALITY_ID: 'ci-http-' + local,
        },
      },
    );
    assert.match(frontendResult, /read allowed; write denied/);

    const stale = await request('PATCH', path, writer.token, {
      kind: 'batch', expectedUpdatedAt: initialUpdatedAt,
      patches: [{
        kind: 'locality_label', scope: 'prea',
        localityId: 'ci-http-' + local, label: 'SHOULD NOT WIN',
      }],
    });
    assert.equal(stale.status, 409);

    const invalid = await request('PATCH', path, writer.token, {
      kind: 'batch', expectedUpdatedAt: updated.body.version.updatedAt,
      patches: [{
        kind: 'locality_geofence', operation: 'upsert', zoneId: 'prea',
        localityId: 'ci-http-' + local, centerLatitude: 100,
        centerLongitude: -40.414678, radiusKm: 2,
      }],
    });
    assert.ok(invalid.status >= 400 && invalid.status < 500);

    const final = await request('GET', path, reader.token);
    assert.equal(final.status, 200);
    assert.equal(final.body.version.updatedAt, updated.body.version.updatedAt);
    assert.equal(
      final.body.catalog.localityDisplayNames.prea['ci-http-' + local],
      'CI API TESTE',
    );
    const quoteBody = {
      origin: {zoneId: 'prea', localityId: 'prea'},
      destination: {zoneId: 'prea', localityId: 'ci-http-' + local},
      category: 'moto',
      period: 'day',
      driverPickupDistanceKm: 0,
    };
    // A new app quote cannot see uncommitted ADM edits.
    const pendingQuote = await request(
      'POST', '/v1/pricing/quote', undefined, quoteBody,
    );
    assert.ok(pendingQuote.status >= 400 && pendingQuote.status < 500,
      'Uma localidade recém-criada não pode ser cotada antes da publicação');

    const publishPath = path + '/publish';
    const readerPublish = await request(
      'POST', publishPath, reader.token,
      { expectedUpdatedAt: updated.body.version.updatedAt },
    );
    assert.equal(readerPublish.status, 403);
    const stillDraft = await request('GET', path, reader.token);
    assert.equal(stillDraft.body.version.status, 'draft');

    // Even an authorized operator must not publish with stale data.
    const stalePublish = await request(
      'POST', publishPath, writer.token,
      { expectedUpdatedAt: initialUpdatedAt },
    );
    assert.equal(stalePublish.status, 409);

    // Publication is distinct from saving a draft, and only an explicit
    // authenticated request can make the version effective.
    const published = await request(
      'POST', publishPath, writer.token,
      { expectedUpdatedAt: updated.body.version.updatedAt },
    );
    assert.equal(published.status, 200);
    assert.equal(published.body.status, 'published');
    const afterPublish = await request('GET', path, reader.token);
    assert.equal(afterPublish.body.version.status, 'published');

    // This is the *actual* HTTP quote contract consumed by passenger clients.
    // It resolves the newly published catalog from ephemeral PostgreSQL,
    // without updating Android/iOS/Web bundles or calling Google/PSPs.
    const quoted = await request(
      'POST', '/v1/pricing/quote', undefined, quoteBody,
    );
    assert.equal(quoted.status, 200);
    assert.equal(quoted.body.kind, 'exact');
    assert.equal(quoted.body.ruleId, 'prea-ci-http-' + local + '-moto');
    assert.equal(quoted.body.baseAmountCents, 1200);
    assert.equal(quoted.body.totalAmountCents, 1200);
    assert.equal(quoted.body.pricingCatalog.catalogVersionId, draftId);

    const audit = await pool.query<{ action: string; metadata: { kind?: string } }>(
      "SELECT action, metadata FROM admin_audit_log WHERE actor_key_id = $1 AND target_id = $2",
      [writer.key.id, draftId],
    );
    assert.equal(audit.rows.filter(row => row.action === 'pricing.catalog_version.updated').length, 1);
    assert.equal(audit.rows.find(row =>
      row.action === 'pricing.catalog_version.updated',
    )?.metadata.kind, 'batch');

    // New draft to verify the complete browser UI + real Admin API client,
    // Core HTTP endpoint and PostgreSQL, without touching the published one.
    const browserDraft = await request(
      'POST', '/v1/admin/pricing/versions', writer.token, {},
    );
    assert.equal(browserDraft.status, 201);
    browserDraftId = browserDraft.body.id as string;
    const inherited = await request(
      'GET', '/v1/admin/pricing/versions/' + browserDraftId, reader.token,
    );
    assert.equal(inherited.status, 200);
    assert.equal(inherited.body.catalog.localities.prea.find(
      (row: {localityId: string}) => row.localityId === 'ci-http-' + local,
    )?.prices.moto.amountCents, 1200,
    'O segundo rascunho ADM deve herdar a tarifa publicada, não reiniciar o catálogo');
    const browserE2E = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('../../../scripts/web/admin_localities_core_browser_e2e.mjs', import.meta.url))],
      {
        encoding: 'utf8',
        timeout: 40_000,
        env: {
          ...process.env,
          RAMO_V5_LOCAL_CORE_URL: baseUrl,
          RAMO_V5_WRITE_TOKEN: writer.token,
          RAMO_V5_READ_TOKEN: reader.token,
          RAMO_V5_LOCALITY_ID: 'ci-browser-' + local,
        },
      },
    );
    assert.match(browserE2E, /created draft, read-only viewing confirmed/);
  } finally {
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit').catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    if (server.exitCode == null) server.kill('SIGKILL');
    for (const id of [browserDraftId, draftId]) {
      if (!id) continue;
      await pool.query('DELETE FROM admin_audit_log WHERE target_id = $1', [id]);
      await pool.query('DELETE FROM pricing_catalog_versions WHERE id = $1', [id]);
    }
    await pool.query('DELETE FROM admin_audit_log WHERE actor_key_id = ANY($1::uuid[])',
      [[writer.key.id, reader.key.id]]);
    await pool.query('DELETE FROM admin_api_keys WHERE id = ANY($1::uuid[])',
      [[writer.key.id, reader.key.id]]);
    await pool.end();
  }
});
