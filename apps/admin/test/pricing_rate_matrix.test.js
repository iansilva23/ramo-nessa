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


test('matriz não apresenta mínimo por km como tarifa final ou Buggy com preço para todos os passageiros', () => {
  const catalog={
    fixedRoutes:[],localities:{prea:[],jijoca:[]},
    distanceFarePolicies:[{
      id:'regional-prea-car',scope:'intra_zone',anchorZoneId:'prea',
      anchorLocalityId:'prea',category:'car',minimumFareCents:2000,
      after22MinimumFareCents:2500,pricePerKmCents:400,
      after22PricePerKmCents:500,minKm:0,maxKm:30,
      coveredLocalityIds:['vila-prea','cavalo-bravo'],
    }],
    jeri:{buggy:{dayBaseCents:3500,after22BaseCents:5000},deliveryBands:[]},
  };
  const rates=buildPricingRateRows(catalog);
  assert.equal(rates.find(x=>x.key==='distance:regional-prea-car').day.amountCents,2000);
  assert.equal(rates.find(x=>x.key==='distance:regional-prea-car').mode,'por-km-noturno');
  assert.match(rates.find(x=>x.key==='jeri-buggy').label,/adicional por passageiro/);
});


test('matriz sinaliza categoria desativada sem liberar elegibilidade ou alterar catálogo', () => {
  const catalog = {
    fixedRoutes: [],
    localities: {
      prea: [{
        localityId: 'cavalo-bravo',
        prices: { car: {kind:'exact',amountCents: 4200}, moto: {kind:'range',minCents:800,maxCents:1400} },
        policy: {enabledCategories:['moto'],applyNightSurcharge:true},
      }],
      jijoca: [],
    },
    surcharges: {preaLocalCarAfter22Cents:500},
    commercialPolicy: {jijocaNightBps:0,preaBuggyAfter22Cents:0},
    distanceFarePolicies: [],
  };
  const snapshot = JSON.stringify(catalog);
  const rows = buildPricingRateRows(catalog);
  const car = rows.find(row => row.key === 'prea:cavalo-bravo:car');
  const moto = rows.find(row => row.key === 'prea:cavalo-bravo:moto');
  assert.equal(car.enabled, false, 'Previsualizar preço não autoriza categoria bloqueada');
  assert.equal(car.day.amountCents, 4200);
  assert.equal(car.night.amountCents, 4700);
  assert.equal(moto.enabled, true);
  assert.deepEqual(moto.day, {kind:'range',minCents:800,maxCents:1400});
  assert.deepEqual(moto.night, {kind:'range',minCents:800,maxCents:1400});
  assert.equal(nightDifference(moto.day, moto.night), null);
  assert.match(formatPriceView(moto.day), /8,00/);
  assert.equal(JSON.stringify(catalog), snapshot);
});

test('matriz não cria tarifas para categorias ausentes nem habilita tarifas regionais por km', () => {
  const catalog = {
    fixedRoutes: [],
    localities: {
      prea:[{localityId:'local-sem-tarifa',prices:{},policy:{enabledCategories:[]}}],
      jijoca:[],
    },
    distanceFarePolicies: [],
  };
  const rows = buildPricingRateRows(catalog);
  assert.equal(rows.some(row => row.kind === 'distance_fare_policy'), false);
  assert.equal(rows.some(row => row.kind === 'locality_price'), false);
  assert.deepEqual(buildPricingRateRows(null), []);
  assert.equal(formatPriceView(null), '—');
});
