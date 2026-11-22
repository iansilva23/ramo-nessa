import assert from 'node:assert/strict';
import test from 'node:test';
import {GooglePlacesService} from '../src/places/google-places-service.js';
import {googlePrimaryPlaces} from '../src/places/google-primary-places.js';
import {prepareThreeRegionCatalog,applyManagementMutation} from '../src/pricing/management-service.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {verifyPlaceProof} from '../src/places/place-proof.js';
import {authoritativeManagedQuote} from '../src/pricing/authoritative-quote.js';

const secret='synthetic-google-primary-proof-secret-123456789';
const session='11111111-1111-4111-8111-111111111111';
const center={latitude:-3.82428,longitude:-38.55410};
export function googlePrimaryCatalog(){
  return applyManagementMutation(prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),{kind:'region.save',region:{
    id:'region-generated-fortaleza',zoneId:'external',name:'Fortaleza',municipality:'Fortaleza',state:'CE',
    ...center,radiusKm:25,categoryIds:['comfort_black'],enabled:true,archived:false,
  }}).snapshot;
}
function setup(){
  const requests:Array<{url:string;body:any}>=[];
  const google=new GooglePlacesService('synthetic-key','https://places.example.invalid/v1/',5000,
    (async(url,init)=>{
      const body=init?.body?JSON.parse(String(init.body)):null;
      requests.push({url:String(url),body});
      if(String(url).includes('autocomplete'))return Response.json({suggestions:[
        {placePrediction:{placeId:'city-id',structuredFormat:{mainText:{text:'Fortaleza'},secondaryText:{text:'CE'}}}},
        {placePrediction:{placeId:'hotel-id',structuredFormat:{mainText:{text:'Hotel Centro'},secondaryText:{text:'Fortaleza, CE'}}}},
      ]});
      const outside=String(url).includes('outside');
      const place={id:outside?'outside-id':'hotel-id',displayName:{text:'Hotel Centro'},formattedAddress:'Rua teste, Fortaleza, CE',
        location:outside?{latitude:-23.55,longitude:-46.63}:center};
      if(String(url).includes('searchText'))return Response.json({places:[place,{...place,id:'outside-id',location:{latitude:-23.55,longitude:-46.63}}]});
      return Response.json(place);
    }) as typeof fetch);
  const input={catalog:googlePrimaryCatalog(),google,proofSecret:secret,proofTtlSeconds:900};
  return {requests,input};
}
for(const query of ['fortal','Fortaleza','Fortaleza CE','hotel','aeroporto','rua','Caicara','Caiçara']){
  test(`Google primary passes original input and all ranked predictions: ${query}`,async()=>{
    const {requests,input}=setup();
    const result=await googlePrimaryPlaces({...input,action:'autocomplete',body:{input:query,sessionToken:session,localOnly:false}});
    assert.ok('suggestions' in result&&result.suggestions);
    assert.deepEqual(result.suggestions.map(r=>r.placeId),['city-id','hotel-id']);
    assert.equal(requests[0]!.body.input,query);
    assert.equal(requests[0]!.body.sessionToken,session);
    assert.equal(requests[0]!.body.locationRestriction,undefined);
    assert.ok(requests[0]!.body.locationBias.rectangle);
    assert.equal(requests[0]!.body.includedPrimaryTypes,undefined);
  });
}
test('Google details use coordinates for generated ID, not old name hint; signed proof validates',async()=>{
  const {input}=setup();
  const result=await googlePrimaryPlaces({...input,action:'details',body:{placeId:'hotel-id',sessionToken:session,externalLocalityId:'fortaleza'}});
  assert.ok('place' in result&&result.place&&'placeProof' in result.place);
  assert.equal(result.place.approvedPricingLocalityId,'region-generated-fortaleza');
  verifyPlaceProof({proof:result.place.placeProof,localityId:'region-generated-fortaleza',...center,secret});
});
test('outside coverage remains discoverable without region/proof or price authorization',async()=>{
  const {input}=setup();
  const result=await googlePrimaryPlaces({...input,action:'details',body:{placeId:'outside-id',sessionToken:session}});
  assert.ok('place' in result&&result.place);
  assert.equal('placeProof' in result.place,false);
  assert.equal('approvedPricingLocalityId' in result.place,false);
  await assert.rejects(authoritativeManagedQuote({catalog:input.catalog,request:{
    origin:{zoneId:'jericoacoara',localityId:'jericoacoara'},destination:{zoneId:'external',localityId:'region-generated-fortaleza'},
    category:'comfort_black',period:'day'},pickup:{latitude:-2.80023,longitude:-40.51638},
    dropoff:{latitude:result.place.latitude,longitude:result.place.longitude},routing:null}));
});
test('manual Google search preserves both geographic metadata and outside results; no alias filtering',async()=>{
  const {input,requests}=setup();
  const result=await googlePrimaryPlaces({...input,action:'search',body:{query:'hotel Fortaleza CE'}});
  assert.ok('places' in result&&result.places);
  assert.equal(result.places.length,2);
  assert.ok('approvedPricingLocalityId' in result.places[0]!);
  assert.equal('approvedPricingLocalityId' in result.places[1]!,false);
  assert.equal(requests[0]!.body.textQuery,'hotel Fortaleza CE');
  assert.equal(requests[0]!.body.pageSize,10);
  assert.ok(requests[0]!.body.locationBias);
});
test('Google outages and invalid sessions are not hidden by fabricated local suggestions',async()=>{
  const {input}=setup();
  await assert.rejects(googlePrimaryPlaces({...input,action:'autocomplete',body:{input:'fortal',sessionToken:''}}),{code:'INVALID_SESSION'});
  const google=new GooglePlacesService('synthetic-key','https://places.example.invalid/v1/',5000,
    (async()=>new Response('unavailable',{status:503})) as typeof fetch);
  await assert.rejects(googlePrimaryPlaces({...input,google,action:'autocomplete',body:{input:'fortal',sessionToken:session}}),{code:'PROVIDER_UNAVAILABLE'});
});
