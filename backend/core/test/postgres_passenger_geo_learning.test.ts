import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresPassengerGeoLearningStore } from '../src/places/passenger-geo-learning.js';
const databaseUrl=process.env.DATABASE_URL?.trim();

test('PostgreSQL aprendizagem: place_id sem PII, claim único e cooldown pós sucesso', {
  skip:!databaseUrl,
},async()=>{
  const pool=createPostgresPool(databaseUrl!);
  const store=new PostgresPassengerGeoLearningStore(pool);
  const id='test-google-'+randomUUID();
  try {
    await pool.query('DELETE FROM geo_passenger_learning_regions WHERE region=$1',['jeri']);
    await store.recordGooglePlaceId(id);
    await store.recordGooglePlaceId(id);
    const row=await pool.query<{selections:string|number}>(
      'SELECT selections FROM geo_passenger_place_references WHERE place_id=$1',[id]);
    assert.equal(Number(row.rows[0]?.selections),2);
    const now=new Date();
    const [first,second]=await Promise.all([store.claim('jeri',now),store.claim('jeri',now)]);
    assert.deepEqual([first,second].sort(),[false,true]);
    await store.finish('jeri',new Date(now.getTime()+30_000),3,true);
    assert.equal(await store.claim('jeri',new Date(now.getTime()+31_000)),false);
    const stat=await store.stats();
    assert.equal(stat.regions.find(x=>x.region==='jeri')?.totalImported,3);
    assert.equal(stat.regions.find(x=>x.region==='jeri')?.status,'succeeded');
  }finally {
    await pool.query('DELETE FROM geo_passenger_place_references WHERE place_id=$1',[id]);
    await pool.query('DELETE FROM geo_passenger_learning_regions WHERE region=$1',['jeri']);
    await pool.end();
  }
});
