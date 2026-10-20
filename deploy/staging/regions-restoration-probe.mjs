// Runs exclusively against the offline restored database. No HTTP server/workers/providers.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPostgresPool } from '/app/dist/src/db/postgres.js';
import { resolvePricingCatalogContext } from '/app/dist/src/pricing/effective-catalog.js';
import { catalogRevision } from '/app/dist/src/pricing/management-service.js';
import { PostgresPricingCatalogVersionRepository } from '/app/dist/src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_regions_restore'); assert.equal(url.port, '5432');
assert.equal(process.env.RAMO_REGIONS_OFFLINE_PROBE, 'true');
const pool = createPostgresPool(url.toString());
const versions = new PostgresPricingCatalogVersionRepository(pool);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fingerprint() {
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const {tablename} of tables.rows) {
    if (['pricing_catalog_versions','admin_audit_log'].includes(tablename)) continue;
    const name = '"' + tablename.replaceAll('"','""') + '"';
    result[tablename] = (await pool.query(`SELECT count(*)::text AS rows,coalesce(sum(('x'||substr(md5(row_to_json(t)::text),1,16))::bit(64)::bigint::numeric),0)::text AS a,coalesce(sum(('x'||substr(md5(row_to_json(t)::text),17,16))::bit(64)::bigint::numeric),0)::text AS b FROM public.${name} t`)).rows[0];
  }
  return result;
}
function cli(args) {
  const r = spawnSync('node', ['dist/scripts/prepare-regions-catalog.js', ...args], {encoding:'utf8', env:process.env});
  if(r.status!==0)writeFileSync('/audit/data/last-cli-error.private.log',String(r.stdout??'')+String(r.stderr??''),{mode:0o600});
  assert.equal(r.status, 0, 'CLI de catálogo falhou na cópia isolada; saída privada omitida.');
  return JSON.parse(r.stdout.trim());
}
try {
  const before = await fingerprint();
  const current = await resolvePricingCatalogContext({versions});
  const original = structuredClone(current.snapshot);
  const path = '/audit/data/plan.json';
  const planResult = cli(['--plan',path]);
  assert.equal(planResult.result,'PLAN_ONLY_NO_MUTATION');
  assert.deepEqual(await fingerprint(),before);
  const checksum = hash(readFileSync(path));
  const args = ['--apply-plan',path,'--plan-sha256',checksum,'--confirm','three-regions-empty-fares-20261020'];
  assert.equal(cli(args).result,'CATALOG_PREPARED');
  const prepared = await resolvePricingCatalogContext({versions});
  const ops = prepared.snapshot.managedOperations;
  assert.ok(ops); assert.equal(ops.regions.length,3); assert.equal(ops.rates.length,0);
  assert.equal(prepared.snapshot.localityGeofences.length,3);
  assert.deepEqual(prepared.snapshot.externalLocalities,[]);
  assert.deepEqual(prepared.snapshot.fixedRoutes,[]);
  assert.deepEqual(prepared.snapshot.distanceFarePolicies,[]);
  assert.deepEqual(ops.categories.map(c=>c.id).sort(), [...original.categories].sort());
  assert.equal(cli(args).result,'ALREADY_APPLIED_NO_CHANGE');
  assert.deepEqual(await fingerprint(),before);
  assert.equal(cli(['--restore-plan',path,'--plan-sha256',checksum,'--expected-revision',catalogRevision(prepared.version),'--confirm','RESTORE_PRICING_CATALOG']).result,'PREVIOUS_CATALOG_RESTORED_AS_NEW_VERSION');
  assert.deepEqual((await resolvePricingCatalogContext({versions})).snapshot, original);
  assert.deepEqual(await fingerprint(),before);
  console.log(JSON.stringify({result:'OFFLINE_RESET_AND_RESTORE_VERIFIED',regions:3,rates:0,categoriesPreserved:true,businessDataPreserved:true,idempotencyVerified:true,restoredAsNewVersion:true}));
} finally { await pool.end(); }
