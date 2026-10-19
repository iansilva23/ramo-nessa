import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPricingRateRows, formatPriceView, nightDifference } from '../src/pricing-rate-matrix.js';

const ex = amountCents=>({kind:'exact',amountCents});
test('matriz expõe rotas, categorias e tarifa noturna editável sem alterar dados',()=>{
  const catalog = {
    fixedRoutes:[{id:'jeri-prea-car',a:'jericoacoara',b:'prea',category:'car',dayCents:13000,after22Cents:15000}],
    commercialPolicy:{jijocaNightBps:3000,preaBuggyAfter22Cents:500,jijocaComfortCents:1700,deliveryBaseCents:600},
    surcharges:{preaComfortCents:2500,preaLocalCarAfter22Cents:500},
    localities:{
      prea:[{localityId:'cavalo-bravo',prices:{car:ex(2500),moto:ex(700),
        after22:{moto:ex(1660)}},
        policy:{enabledCategories:['car','moto','comfort_black'],applyNightSurcharge:true}}],
      jijoca:[{localityId:'baixio',prices:{car:ex(6000),moto:ex(2000),after22:{}},
        policy:{enabledCategories:['car','moto','comfort_black'],applyNightSurcharge:true}}],
    },
    jeri:{buggy:{dayBaseCents:3500,after22BaseCents:5000},deliveryBands:[{maxKm:2,amountCents:500}]},
    distanceFarePolicies:[],
  };
  const before=JSON.stringify(catalog);
  const list=buildPricingRateRows(catalog);
  const row=key=>list.find(x=>x.key===key);
  assert.equal(row('route:jeri-prea-car').night.amountCents,15000);
  assert.equal(row('prea:cavalo-bravo:moto').mode,'manual');
  assert.equal(row('prea:cavalo-bravo:car').night.amountCents,3000);
  assert.equal(row('prea:cavalo-bravo:comfort_black').day.amountCents,5000);
  assert.equal(row('prea:cavalo-bravo:comfort_black').night.amountCents,5500);
  assert.equal(row('jijoca:baixio:car').night.amountCents,7800);
  assert.equal(nightDifference(ex(2500),ex(3000)),500);
  assert.equal(formatPriceView(ex(13000)).includes('130'),true);
  assert.equal(row('regional-delivery').mode,'sem-adicional');
  assert.equal(JSON.stringify(catalog),before);
});
