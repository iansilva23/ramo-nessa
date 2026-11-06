// Invoked only as a short-lived reader with the existing Core database environment.
import {readFileSync} from 'node:fs';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
import {PostgresPricingCatalogVersionRepository} from '/app/dist/src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {resolvePricingCatalogContext} from '/app/dist/src/pricing/effective-catalog.js';
import {catalogRevision} from '/app/dist/src/pricing/management-service.js';
import {snapshotDigest} from '/app/dist/src/pricing/catalog-reset-plan.js';
import assert from 'node:assert/strict';
assert.equal(process.env.NODE_ENV,'staging');
const pool=createPostgresPool(process.env.DATABASE_URL);
try{
 const current=await resolvePricingCatalogContext({versions:new PostgresPricingCatalogVersionRepository(pool)});
 const snapshot=current.snapshot,ops=snapshot.managedOperations;
 const plan=JSON.parse(readFileSync('/ops/data/reset-active.plan.json')).plan;
 const expectedCategories=(plan.sourceSnapshot.managedOperations?.categories?.map(c=>c.id)||plan.sourceSnapshot.categories).sort();
 const emptyPrepared=!!ops&&ops.regions.length===3&&ops.rates.length===0&&
   JSON.stringify(ops.regions.filter(r=>r.enabled&&!r.archived).map(r=>r.id).sort())===JSON.stringify(['jericoacoara','jijoca','prea'])&&
   JSON.stringify(ops.categories.map(c=>c.id).sort())===JSON.stringify(expectedCategories)&&
   snapshot.fixedRoutes.length===0&&snapshot.distanceFarePolicies.length===0&&snapshot.localityGeofences.length===3&&snapshot.externalLocalities.length===0;
 console.log(JSON.stringify({revision:catalogRevision(current.version),versionId:current.version?.id??null,
   digest:snapshotDigest(snapshot),managed:!!ops,emptyPrepared,regionCount:ops?.regions.length??null,rateCount:ops?.rates.length??null,
   requestId:plan.requestId,originalDigest:plan.sourceDigest,migrationId:snapshot.managementMigration?.id??null}));
}finally{await pool.end();}
