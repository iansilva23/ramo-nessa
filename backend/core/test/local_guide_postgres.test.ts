import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PostgresGuideStore} from '../src/guide/guide-store.js';
import {publicGuide} from '../src/guide/guide.js';
const url=process.env.RAMO_V5_ATOMIC_PG_URL;
test('additive migration preserves source tours/photos and PostgreSQL publication is durable, isolated and atomic',{skip:!url},async()=>{
 if(!url)throw Error('Missing disposable database');const schema='guide_'+randomUUID().replaceAll('-',''),root=new pg.Pool({connectionString:url}),pool=new pg.Pool({connectionString:url,options:'-c search_path='+schema+',public'});
 try{
  await root.query('CREATE SCHEMA '+schema);await pool.query('CREATE TABLE agency_tours (LIKE public.agency_tours INCLUDING ALL)');
  await pool.query(`INSERT INTO agency_tours(slug,enabled,title,badge,short_description,description,cover_image,cover_image_mime_type,cover_image_version,updated_at) VALUES('existing-tour',true,'Passeio existente','APROVADO','Resumo existente','Descrição existente',$1,'image/png',1,NOW())`,[Buffer.from([137,80,78,71,13,10,26,10])]);
  const original=await pool.query('SELECT * FROM agency_tours');await pool.query(await readFile(new URL('../migrations/087_local_guide.sql',import.meta.url),'utf8'));assert.deepEqual((await pool.query('SELECT * FROM agency_tours')).rows,original.rows);
  const a=new PostgresGuideStore(pool),b=new PostgresGuideStore(pool);let s=await a.read();assert.equal(s.entities.find(e=>e.id==='tour-existing-tour')?.published?.name,'Passeio existente');
  assert.equal(publicGuide(s).entities.filter(e=>e.kind==='category').length,1);assert.equal(s.entities.filter(e=>e.kind==='category').length,6);
  const item=s.entities.find(e=>e.id==='tour-existing-tour')!,image=item.draft.image.split('/').at(-1)!;assert.ok(await a.image(image));
  const before=publicGuide(s);s=await a.write({op:'save',id:item.id,kind:item.kind,parentId:item.parentId,expectedRevision:s.revision,data:{...item.draft,name:'Nome em rascunho'}},'Admin A');assert.deepEqual(publicGuide(s).entities,before.entities);
  const raced=await Promise.allSettled([a.write({op:'publish',id:item.id,expectedRevision:s.revision},'Admin A'),b.write({op:'unpublish',id:item.id,expectedRevision:s.revision},'Admin B')]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(raced.filter(r=>r.status==='rejected').length,1);
  const persisted=await b.read();assert.equal(persisted.revision,2);assert.equal((await b.history()).length,3);assert.deepEqual((await pool.query('SELECT * FROM agency_tours')).rows,original.rows);
  const saved=(await b.history()).at(-1)!.state.entities.find(e=>e.id===item.id)!.published!;await b.write({op:'save',id:item.id,kind:item.kind,parentId:item.parentId,expectedRevision:persisted.revision,data:saved},'Admin B');assert.equal((await a.read()).entities.find(e=>e.id===item.id)?.draft.name,'Passeio existente');
 }finally{await pool.end();await root.query('DROP SCHEMA '+schema+' CASCADE');await root.end();}
});
