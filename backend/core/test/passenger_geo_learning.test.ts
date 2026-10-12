import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryPassengerGeoLearningStore, PassengerGeoLearner,
} from '../src/places/passenger-geo-learning.js';
import { InMemoryGeoCatalogRepository } from '../src/places/geo-catalog-repository.js';

const poi = { source:'osm' as const, sourceId:'node/123',
  name:'Restaurante do Preá',address:'Preá, Cruz - CE',
  category:'amenity:restaurant',city:'Cruz',
  latitude:-2.82017,longitude:-40.41467 };

test('um passageiro gera referência Google isolada e importação somente de fonte reutilizável',async()=>{
  const store=new InMemoryPassengerGeoLearningStore();
  const catalog=new InMemoryGeoCatalogRepository();
  let calls=0;
  const learner=new PassengerGeoLearner(store,catalog,async region=>{
    assert.equal(region,'prea');calls++;
    return {places:[poi],truncated:false};
  });
  await learner.observe({provider:'google',placeId:'googlePlaceA',region:'prea'});
  assert.equal((await catalog.search('restaurante',true)).length,1);
  assert.equal((await catalog.search('restaurante',true))[0]?.source,'osm');
  assert.deepEqual((await store.stats()).regions.map(x=>x.status),['succeeded']);
  await learner.observe({provider:'google',placeId:'googlePlaceA',region:'prea'});
  assert.equal(calls,1); // 90-day independent-source refresh
  assert.deepEqual(await store.stats().then(x=>[x.googlePlaceReferences,x.selectedGooglePlaces]),[1,2]);
});
test('Google place id não é resolvido nem incluído como POI no GeoDB',async()=>{
  const store=new InMemoryPassengerGeoLearningStore();
  const catalog=new InMemoryGeoCatalogRepository();
  const learner=new PassengerGeoLearner(store,catalog,async()=>({places:[],truncated:false}));
  await learner.observe({provider:'google',placeId:'googlePlaceB',region:null});
  assert.equal((await store.stats()).googlePlaceReferences,1);
  assert.equal(await catalog.findById('googlePlaceB'),null);
  assert.equal((await catalog.search('google',true)).length,0);
});
test('falha da fonte independente não interrompe seleção e usa espera menor',async()=>{
  const store=new InMemoryPassengerGeoLearningStore();
  const catalog=new InMemoryGeoCatalogRepository();
  const errors:unknown[]=[];
  const learner=new PassengerGeoLearner(store,catalog,async()=>{
    throw new Error('Overpass unavailable');
  },error=>{errors.push(error)});
  await learner.observe({provider:'google',placeId:'googlePlaceC',region:'jeri'});
  assert.equal(errors.length,1);
  assert.equal((await store.stats()).regions[0]?.status,'failed');
  assert.equal((await store.stats()).selectedGooglePlaces,1);
  assert.equal((await catalog.search('lugar',true)).length,0);
});
test('tabela de referências valida identificadores, sem salvar conteúdo de busca',async()=>{
  const store=new InMemoryPassengerGeoLearningStore();
  await assert.rejects(()=>store.recordGooglePlaceId('geo:osm:node/1'),/INVALID_GOOGLE_PLACE_ID/);
  await assert.rejects(()=>store.recordGooglePlaceId('\n'),/INVALID_GOOGLE_PLACE_ID/);
});
