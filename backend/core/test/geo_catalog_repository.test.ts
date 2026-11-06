import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryGeoCatalogRepository, geoPlaceId, validateGeoBatch } from '../src/places/geo-catalog-repository.js';
const local = {source:'osm' as const,sourceId:'node/123',name:'Pousada do Preá',
  address:'Rua Principal, Preá, CE',category:'hospedagem',city:'Cruz',
  latitude:-2.82,longitude:-40.42};
test('importação exige fonte reutilizável, bloqueia entradas repetidas e valida pontos',()=>{
  assert.throws(()=>validateGeoBatch([{...local,source:'google'}]),/INVALID_RECORD/);
  assert.throws(()=>validateGeoBatch([local,local]),/DUPLICATE_ID/);
  assert.throws(()=>validateGeoBatch([{...local,latitude:999}]),/INVALID_RECORD/);
  assert.equal(validateGeoBatch([local]).length,1);
});
test('GeoDB é compartilhado: pesquisa, atualiza sem duplicar e registra alterações',async()=>{
  const repo=new InMemoryGeoCatalogRepository();
  assert.equal(geoPlaceId('osm','node/123'),'geo:osm:node/123');
  assert.deepEqual((await repo.preview([local])).map(x=>x.kind),['new']);
  assert.deepEqual(await repo.apply([local]),{added:1,changed:0,unchanged:0});
  assert.equal((await repo.search('pousada',true))[0]?.name,'Pousada do Preá');
  assert.equal((await repo.search('prea',true)).length,1);
  assert.deepEqual(await repo.apply([local]),{added:0,changed:0,unchanged:1});
  const changed={...local,name:'Pousada Nova do Preá'};
  assert.deepEqual((await repo.preview([changed])).map(x=>x.kind),['changed']);
  assert.deepEqual(await repo.apply([changed]),{added:0,changed:1,unchanged:0});
  assert.equal((await repo.findById('geo:osm:node/123'))?.name,changed.name);
});
test('busca local nunca devolve ponto distante nem retorna Google sem fonte',async()=>{
  const repo=new InMemoryGeoCatalogRepository();
  await repo.apply([local,{...local,sourceId:'node/444',name:'Pousada Fortaleza',
    address:'Fortaleza, CE',latitude:-3.73,longitude:-38.52}]);
  assert.equal((await repo.search('Pousada',true)).length,1);
  assert.equal((await repo.search('Pousada',false)).length,2);
});
