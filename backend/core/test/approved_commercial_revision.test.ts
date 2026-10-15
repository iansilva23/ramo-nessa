import assert from 'node:assert/strict';
import test from 'node:test';
import {STATIC_PRICING_CATALOG_V1 as catalog} from '../src/pricing/catalog-snapshot.js';
import {quoteFare} from '../src/pricing/quote-engine.js';
import {requiresFourByFourForTrip} from '../src/pricing/category-eligibility.js';
import {parsePricingCatalogDraftPatch} from '../src/pricing/pricing-catalog-version-validation.js';
import {publicPricingPolicyView} from '../src/pricing/public-pricing-policy.js';
import type {LocationRef,ServiceCategory,PricePeriod} from '../src/pricing/types.js';
const ref=(id:string):LocationRef=>({zoneId:['prea','jijoca','jericoacoara'].includes(id)?id as LocationRef['zoneId']:'external',localityId:id});
function amount(origin:LocationRef,destination:LocationRef,category:ServiceCategory,period:PricePeriod,passengers=1,tripDistanceKm?:number){
 const result=quoteFare({origin,destination,category,period,passengers,...(tripDistanceKm==null?{}:{tripDistanceKm})});
 assert.equal(result.kind,'exact');if(result.kind!=='exact')throw Error('Expected exact quote');return result.baseAmountCents;
}
const transfers:Array<[string,string,ServiceCategory,number,number]>=[
 ['jericoacoara','prea','car',130,150],['jericoacoara','prea','comfort_black',150,190],['jericoacoara','prea','buggy',110,150],
 ['jericoacoara','jijoca','car',140,160],['jericoacoara','jijoca','comfort_black',160,200],
 ['jericoacoara','airport-jjd','car',200,200],['jericoacoara','airport-jjd','comfort_black',220,220],
 ['jericoacoara','fortaleza','car',800,800],['jericoacoara','fortaleza','comfort_black',825,825],
 ['prea','airport-jjd','car',70,70],['prea','airport-jjd','comfort_black',90,90],['prea','airport-jjd','moto',60,84],
 ['prea','jijoca','car',120,140],['prea','jijoca','comfort_black',150,170],['prea','jijoca','moto',60,96],
];
for(const[a,b,category,day,night]of transfers)test(`approved transfer ${a}/${b} ${category} both directions`,()=>{
 for(const[origin,destination]of[[ref(a),ref(b)],[ref(b),ref(a)]] as const){
  assert.equal(amount(origin,destination,category,'day',category==='moto'?1:4),day*100);
  assert.equal(amount(origin,destination,category,'after_22',category==='moto'?1:4),night*100);
  if(category==='car'||category==='comfort_black')assert.equal(requiresFourByFourForTrip({catalog,category,origin,destination}),a==='jericoacoara'||b==='jericoacoara');
 }
});
// Independent approved expected values, not computed from the catalogue.
const prea:Array<[string,number,number,number]>=[
 ['prea',7,16.6,30],['formosa',7,16.6,30],['cavalo-bravo',7,16.6,30],['laguim',9,12.6,32],['caicara',14,19.6,37],['castelhano',18,25.2,41],['buraco-azul',19,26.6,42],['corrego-dos-anas',23,32.2,46],['caicara-de-baixo',27,37.8,50],['guias-monteiros',30,42,53],['ius',30,42,53],['barrinha-de-baixo',30,42,53],['pinguela',30,42,53],['carrapateiras',35,49,58],['cajueirinho',40,56,63],['corrego-das-panelas',45,63,68],['lagoa-azul',50,70,73],['lagamar',50,70,73],['munzua',50,70,73],['aranau',60,84,83],['lagoa-do-paraiso',90,126,113],
 ['prea-beach-villas',7,11.2,30],['play-kitie',7,11.2,30],['cabana',7,11.2,30],['ranchos',7,11.2,30],['vila-prea',7,11.2,30],['clube-da-irrancha',9,14.4,32],['casas-eli-lula',9,14.4,32],['d3-luna',9,14.4,32],['kite-lodge',10,16,33],['beach-house',13,20.8,36],['vida-ao-vento',13,20.8,36],['casa-de-praia-teto-branco',15,24,38],
];
for(const[id,motoDay,motoNight,carDay]of prea)test(`approved Preá locality ${id}`,()=>{
 const origin=ref('prea'),destination:LocationRef={zoneId:'prea',localityId:id};
 for(const[period,moto,car]of[['day',motoDay,carDay],['after_22',motoNight,carDay+5]]as const){
  for(const[a,b]of[[origin,destination],[destination,origin]]as const){
   assert.equal(amount(a,b,'moto',period),Math.round(moto*100));assert.equal(amount(a,b,'car',period),car*100);
   assert.equal(amount(a,b,'comfort_black',period),(car+25)*100);
   for(let n=1;n<=4;n++)assert.equal(amount(a,b,'buggy',period,n),(car-5+(n-1)*2)*100);
  }
 }
});
const jijoca:Array<[string,number,number]>=[['jijoca',10,45],['vila-sao-paulo',15,45],['corrego-da-forquilha-i',15,50],['corrego-do-urubu',15,50],['corrego-da-forquilha-ii',20,55],['carro-quebrado',20,55],['baixio',20,60],['corrego-perdido',25,65],['cruzeiro-do-brandao',30,65],['corrego-de-dentro',30,65],['lagoa-das-pedras',35,70],['corrego-do-mourao',40,75],['chapadinha',45,80],['caminho-mangue-seco',50,80],['proximo-mangue-seco',55,80],['mangue-seco',60,90]];
for(const[id,moto,car]of jijoca)test(`approved Jijoca locality ${id}`,()=>{
 const origin=ref('jijoca'),destination:LocationRef={zoneId:'jijoca',localityId:id};
 for(const[period,factor]of[['day',1],['after_22',1.3]]as const){
  assert.equal(amount(origin,destination,'moto',period),Math.round(moto*100*factor));assert.equal(amount(origin,destination,'car',period),Math.round(car*100*factor));assert.equal(amount(origin,destination,'comfort_black',period),Math.round(car*100*factor)+1700);
 }
});
const long:Array<[string,number,number,number]>=[['cruz',120,156,80],['bela-cruz',180,234,150],['acarau',190,247,100],['marco',250,325,160],['triangulo-do-marco',260,338,170],['granja',260,338,170],['itarema',260,338,170],['morrinhos',320,416,190],['camocim',350,455,200],['amontada',360,468,250],['santana-do-acarau',400,520,250],['parazinha',480,624,140],['itapipoca',500,650,300],['sobral',520,676,350]];
for(const[id,car,comfort,moto]of long)test(`approved long route ${id}`,()=>{
 for(const period of['day','after_22']as const){assert.equal(amount(ref('prea'),ref(id),'car',period),car*100);assert.equal(amount(ref('prea'),ref(id),'comfort_black',period),comfort*100);assert.equal(amount(ref('prea'),ref(id),'moto',period),Math.round(moto*100*(period==='after_22'?1.6:1)));}
});
test('regional delivery, fractional km and district-to-district',()=>{
 const pairs:Array<[LocationRef,LocationRef]>=[[ref('prea'),ref('prea')],[ref('prea'),ref('airport-jjd')],[ref('jijoca'),ref('jijoca')],[{zoneId:'jijoca',localityId:'baixio'},{zoneId:'jijoca',localityId:'mangue-seco'}]];
 for(const[a,b]of pairs)for(const period of['day','after_22']as const)for(const[d,c]of[[0,600],[5,600],[5.5,650],[6,700],[6.8,780],[10,1100]])assert.equal(amount(a,b,'delivery',period,1,d),c);
 assert.throws(()=>amount(ref('prea'),ref('prea'),'delivery','day'),{code:'MISSING_DISTANCE'});
});
test('Jeri disallows Moto, local Carro/Comfort and unsupported transfers',()=>{
 for(const other of['jericoacoara','prea','jijoca','airport-jjd','fortaleza'])assert.throws(()=>amount(ref('jericoacoara'),ref(other),'moto','day'),{code:'UNAVAILABLE_CATEGORY'});
 for(const category of['car','comfort_black']as const)assert.throws(()=>amount(ref('jericoacoara'),ref('jericoacoara'),category,'day'),{code:'UNAVAILABLE_CATEGORY'});
 assert.throws(()=>amount(ref('jericoacoara'),ref('sobral'),'comfort_black','day'),{code:'UNAVAILABLE_CATEGORY'});
 assert.throws(()=>amount(ref('jericoacoara'),ref('jijoca'),'buggy','day'),{code:'UNAVAILABLE_CATEGORY'});
});
test('Buggy charges extra local passengers, but transfers remain whole-vehicle',()=>{
 for(let n=1;n<=4;n++){assert.equal(amount(ref('jericoacoara'),ref('jericoacoara'),'buggy','day',n),3500+(n-1)*200);assert.equal(amount(ref('jericoacoara'),ref('jericoacoara'),'buggy','after_22',n),5000+(n-1)*200);assert.equal(amount(ref('jericoacoara'),ref('prea'),'buggy','day',n),11000);}
 assert.throws(()=>amount(ref('jericoacoara'),ref('prea'),'buggy','day',5),{code:'INVALID_PASSENGER_COUNT'});
});
test('shared settings reject URLs as phone and hide inactive options',()=>{
 const settings={...catalog.sharedTransfers!,enabled:true,whatsappPhone:'5588999999999'};
 assert.equal(parsePricingCatalogDraftPatch({kind:'shared_transfers',settings}).kind,'shared_transfers');
 assert.throws(()=>parsePricingCatalogDraftPatch({kind:'shared_transfers',settings:{...settings,whatsappPhone:'https://example.com'}}));
 const snapshot={...structuredClone(catalog),sharedTransfers:settings};
 const context={snapshot,reference:{catalogVersion:snapshot.catalogVersion},version:null};
 assert.equal(publicPricingPolicyView(context).sharedTransfers?.whatsappPhone,'5588999999999');
 assert.equal('price' in publicPricingPolicyView(context).sharedTransfers!,false);
 snapshot.sharedTransfers.enabled=false;assert.equal(publicPricingPolicyView(context).sharedTransfers,null);
});

test('night-only Carro edits also update derived Comfort without double surcharge',()=>{
 const snapshot=structuredClone(catalog);
 snapshot.localities.prea.prea!.after22={...snapshot.localities.prea.prea!.after22,car:3600};
 for(const[category,expected]of[['car',3600],['comfort_black',6100]]as const){
  const quote=quoteFare({origin:ref('prea'),destination:ref('prea'),category,period:'after_22'},snapshot);
  assert.equal(quote.kind,'exact');if(quote.kind==='exact')assert.equal(quote.baseAmountCents,expected);
 }
});
