import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresGeoCatalogRepository } from '../src/places/geo-catalog-repository.js';
import { PostgresGeoStorageMaintenance } from '../src/places/geo-storage-maintenance.js';
const databaseUrl=process.env.DATABASE_URL?.trim();

test('GeoDB PostgreSQL: expired, popular and manual records survive only as policy permits',
 {skip:!databaseUrl},async()=>{
  const pool=createPostgresPool(databaseUrl!);
  const geo=new PostgresGeoCatalogRepository(pool);
  const maint=new PostgresGeoStorageMaintenance(pool);
  const id=randomUUID();
  const base={name:'Pousada de Teste',address:'Preá, Cruz, CE',category:'guest_house',
   city:'Cruz',latitude:-2.82,longitude:-40.414};
  const unused={...base,source:'osm' as const,sourceId:'node/old-'+id};
  const popular={...base,source:'osm' as const,sourceId:'node/pop-'+id};
  const manual={...base,source:'manual' as const,sourceId:'manual-'+id};
  const ids=[unused,popular,manual].map(p=>'geo:'+p.source+':'+p.sourceId);
  let policy:Awaited<ReturnType<typeof maint.report>>['policy']|null=null;
  try{
   policy=(await maint.report()).policy;
   await maint.updatePolicy({maxStorageMb:128,alertPercent:80,retentionDays:120,autoCleanupEnabled:false});
   await geo.apply([unused,popular,manual]);
   await pool.query("UPDATE geo_catalog_places SET updated_at=now()-interval '131 days' WHERE id=ANY($1::text[])",[ids]);
   for(let i=0;i<3;i++)await maint.recordSelection(ids[1]!);
   assert.equal((await maint.dueRegions()).includes('prea'),true);
   const stats=await maint.report();
   assert.equal(stats.expiredPlaces>=2,true);
   assert.equal(stats.cleanupEligible>=1,true);
   const preview=await maint.cleanup({dryRun:true});
   assert.equal(preview.eligible>=1,true);
   assert.equal(await geo.findById(ids[0]!),null);
   const raw=await pool.query('SELECT id FROM geo_catalog_places WHERE id=$1',[ids[0]]);
   assert.equal(raw.rowCount,1);
   const applied=await maint.cleanup({dryRun:false,limit:1});
   assert.equal(applied.removed,1);
   const remaining=await pool.query<{id:string}>('SELECT id FROM geo_catalog_places WHERE id=ANY($1::text[])',[ids]);
   assert.equal(remaining.rows.some(x=>x.id===ids[0]),false);
   assert.equal(remaining.rows.some(x=>x.id===ids[1]),true);
   assert.equal(remaining.rows.some(x=>x.id===ids[2]),true);
   assert.equal((await maint.report()).policy.lastCleanupAt!=null,true);
  }finally{
   await pool.query('DELETE FROM geo_catalog_places WHERE id=ANY($1::text[])',[ids]);
   if(policy)await maint.updatePolicy(policy);
   await pool.end();
  }
});
