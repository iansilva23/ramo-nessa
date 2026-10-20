import assert from 'node:assert/strict';
import test from 'node:test';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {adminPricingCatalogView} from '../src/pricing/admin-catalog.js';
import {municipalityFor,isLocalServiceMunicipality,isKnownOutsideLocalArea} from '../src/pricing/municipality-directory.js';
import {quoteFare} from '../src/pricing/quote-engine.js';
import {PricingError} from '../src/pricing/types.js';
import {parsePricingCatalogDraftPatch,InvalidPricingCatalogPatchError} from '../src/pricing/pricing-catalog-version-validation.js';
import {InMemoryAdminRepository} from '../src/admin/repositories/in-memory-admin-repository.js';
import {InMemoryPricingCatalogVersionRepository} from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {createPricingCatalogDraft,updatePricingCatalogDraft} from '../src/pricing/pricing-catalog-version-service.js';

test('Cruz, Jijoca, Aeroporto e Barrinha de Baixo não dependem da zona legada',()=>{
  const c=STATIC_PRICING_CATALOG_V1;
  assert.equal(municipalityFor(c,'prea','prea').municipalityId,'cruz');
  assert.equal(municipalityFor(c,'prea','cavalo-bravo').municipalityId,'cruz');
  assert.equal(municipalityFor(c,'prea','barrinha-de-baixo').municipalityId,'acarau');
  assert.equal(municipalityFor(c,'prea','jericoacoara').municipalityId,'jijoca-de-jericoacoara');
  assert.equal(municipalityFor(c,'jericoacoara','jericoacoara').municipalityId,'jijoca-de-jericoacoara');
  assert.equal(municipalityFor(c,'external','airport-jjd').municipalityId,'cruz');
  assert.equal(municipalityFor(c,'external','fortaleza').municipalityId,'fortaleza');
  assert.equal(municipalityFor(c,'jijoca','baixio').municipalityId,'jijoca-de-jericoacoara');
  assert.equal(municipalityFor(c,'jijoca','lagoa-das-pedras').municipalityId,'jijoca-de-jericoacoara');
  assert.equal(isKnownOutsideLocalArea(municipalityFor(c,'prea','barrinha-de-baixo')),true);
  assert.equal(isLocalServiceMunicipality(municipalityFor(c,'external','airport-jjd')),true);
  assert.equal(municipalityFor(c,'prea','beach-house').status,'pending_review');
  assert.equal(municipalityFor(c,'prea','triangulo-do-marco').municipalityId,'marco');
  assert.equal(municipalityFor(c,'prea','aranau').municipalityId,'acarau');
});
test('Tabela administrativa mantém ID e preço mas mostra município e pendências',()=>{
  const original=structuredClone(STATIC_PRICING_CATALOG_V1);
  const view=adminPricingCatalogView(original);
  const barrinha=view.localities.prea.find(v=>v.localityId==='barrinha-de-baixo');
  assert.equal(barrinha?.municipalityLabel,'Acaraú/CE');
  assert.equal(view.municipalityAssignments.external['airport-jjd']?.municipalityId,'cruz');
  assert.equal(view.municipalityAssignments.jericoacoara.municipalityId,'jijoca-de-jericoacoara');
  assert.deepEqual(original,STATIC_PRICING_CATALOG_V1);
});
test('tarifas comerciais aprovadas não são apagadas quando destino pertence a outro município',()=>{
  const catalog=STATIC_PRICING_CATALOG_V1;
  const car=quoteFare({
    origin:{zoneId:'prea',localityId:'prea'},
    destination:{zoneId:'prea',localityId:'barrinha-de-baixo'},
    category:'car',period:'day',
  },catalog);
  assert.equal(car.kind,'exact');
  const transfer=quoteFare({
    origin:{zoneId:'prea',localityId:'vila-prea'},
    destination:{zoneId:'jericoacoara'},category:'car',period:'day',
  },catalog);
  assert.equal(transfer.kind,'exact');
});
test('classificação municipal exige fonte HTTPS e rascunho isolado',async()=>{
  assert.throws(()=>parsePricingCatalogDraftPatch({
    kind:'municipality_assignment',scope:'prea',localityId:'cavalo-bravo',
    municipalityId:'cruz',status:'confirmed',sourceUrl:null,
  }),(e:unknown)=>e instanceof InvalidPricingCatalogPatchError);
  const versions=new InMemoryPricingCatalogVersionRepository();
  const admin=new InMemoryAdminRepository();
  const actor={kind:'user' as const,id:'municipal-auditor',name:'Municipal Auditor'};
  const draft=await createPricingCatalogDraft({versions,admin,actor,
    now:new Date('2026-10-18T00:00:00.000Z')});
  const updated=await updatePricingCatalogDraft({versions,admin,actor,
    versionId:draft.id,now:new Date('2026-10-18T00:01:00.000Z'),
    patch:parsePricingCatalogDraftPatch({
      kind:'municipality_assignment',scope:'prea',localityId:'cavalo-bravo',
      municipalityId:'cruz',status:'confirmed',
      sourceUrl:'https://prefeitura.cruz.ce.gov.br/',
    }),
  });
  assert.equal(updated.snapshot.municipalityOverrides?.prea?.['cavalo-bravo']?.municipalityId,'cruz');
  assert.equal(draft.snapshot.municipalityOverrides?.prea?.['cavalo-bravo'],undefined);
  assert.throws(()=>parsePricingCatalogDraftPatch({
    kind:'municipality_assignment',scope:'prea',localityId:'cavalo-bravo',
    municipalityId:'acarau',status:'pending_review',sourceUrl:null,
  }),InvalidPricingCatalogPatchError);
});


test('inventário municipal: 83 registros por escopo, sem presumir município dos pendentes', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const grouped = {
    prea: Object.keys(catalog.localities.prea),
    jijoca: Object.keys(catalog.localities.jijoca),
    external: catalog.externalLocalities,
    jericoacoara: ['jericoacoara'],
  } as const;
  assert.deepEqual(Object.fromEntries(
    Object.entries(grouped).map(([scope, ids]) => [scope, ids.length]),
  ), {prea:50,jijoca:16,external:16,jericoacoara:1});
  let confirmed=0, pending=0;
  for (const [scope,ids] of Object.entries(grouped)) {
    for (const id of ids) {
      const assignment=municipalityFor(catalog,scope as keyof typeof grouped,id);
      if (assignment.status === 'confirmed') {
        assert.ok(assignment.municipalityId, scope + '/' + id);
        assert.match(assignment.sourceUrl ?? '',/^https:\/\//);
        confirmed++;
      } else {
        assert.equal(assignment.status,'pending_review');
        assert.equal(assignment.municipalityId,null);
        pending++;
      }
    }
  }
  assert.equal(confirmed+pending,83);
  assert.equal(confirmed,57);
  assert.equal(pending,26);
});


test('cadastro municipal não autoriza automaticamente táxi ou mototáxi em cidades externas', () => {
  const catalog=STATIC_PRICING_CATALOG_V1;
  for (const [scope,id] of [
    ['prea','barrinha-de-baixo'],
    ['prea','acarau'],
    ['prea','triangulo-do-marco'],
    ['external','fortaleza'],
  ] as const) {
    const assignment=municipalityFor(catalog,scope,id);
    assert.equal(assignment.status,'confirmed',scope+'/'+id);
    assert.equal(isLocalServiceMunicipality(assignment),false,scope+'/'+id);
    assert.equal(isKnownOutsideLocalArea(assignment),true,scope+'/'+id);
  }
  for (const [scope,id] of [
    ['prea','prea'],
    ['prea','cavalo-bravo'],
    ['jijoca','baixio'],
    ['jericoacoara','jericoacoara'],
  ] as const) {
    assert.equal(isLocalServiceMunicipality(municipalityFor(catalog,scope,id)),true,
      scope+'/'+id);
  }
  const pending=municipalityFor(catalog,'prea','beach-house');
  assert.equal(pending.status,'pending_review');
  assert.equal(isLocalServiceMunicipality(pending),false);
  assert.equal(isKnownOutsideLocalArea(pending),false);
  assert.equal(catalog.distanceFarePolicies.length,0);
});

test('tarifa regional futura não transforma localidades pendentes em corrida por km', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  const byScope = {
    prea: Object.keys(catalog.localities.prea),
    jijoca: Object.keys(catalog.localities.jijoca),
  } as const;

  // Simulate an overly broad opt-in draft without publishing it. Regional
  // prices may apply only if BOTH localities have confirmed municipality data.
  for (const [scope, ids] of Object.entries(byScope) as Array<
    ['prea' | 'jijoca', string[]]
  >) {
    catalog.distanceFarePolicies.push({
      id: 'regression-must-never-price-unverified-' + scope,
      anchorZoneId: scope,
      anchorLocalityId: scope,
      category: 'moto',
      scope: 'intra_zone',
      coveredLocalityIds: ids,
      minKm: 0,
      maxKm: 100,
      minimumFareCents: 1000,
      pricePerKmCents: 100,
      after22MinimumFareCents: 1200,
      after22PricePerKmCents: 150,
    });
    for (const id of ids) {
      const assignment = municipalityFor(catalog, scope, id);
      if (assignment.status !== 'pending_review') continue;
      assert.equal(isLocalServiceMunicipality(assignment), false, scope + '/' + id);

      // The legacy fare must not hide a broken regional boundary in this
      // synthetic test; original catalog and production prices stay intact.
      const original = catalog.localities[scope][id];
      catalog.localities[scope][id] = {};
      try {
        for (const period of ['day', 'after_22'] as const) {
          assert.throws(() => quoteFare({
            origin: {zoneId: scope, localityId: scope},
            destination: {zoneId: scope, localityId: id},
            category: 'moto',
            period,
            tripDistanceKm: 5,
          }, catalog), (error: unknown) =>
            error instanceof PricingError && error.code === 'UNKNOWN_ROUTE',
          'Regra por km não pode precificar ' + scope + '/' + id + ' (' + period + ')');
        }
      } finally {
        catalog.localities[scope][id] = original!;
      }
    }
  }

  // Source confirmation alone is not an operational permit, but a confirmed
  // same-municipality pair may reach a deliberately published regional rule.
  const old = catalog.localities.prea['cavalo-bravo'];
  catalog.localities.prea['cavalo-bravo'] = {};
  try {
    const quote = quoteFare({
      origin: {zoneId: 'prea', localityId: 'prea'},
      destination: {zoneId: 'prea', localityId: 'cavalo-bravo'},
      category: 'moto', period: 'day', tripDistanceKm: 5,
    }, catalog);
    assert.equal(quote.ruleId, 'regression-must-never-price-unverified-prea');
    assert.equal(quote.kind, 'exact');
  } finally {
    catalog.localities.prea['cavalo-bravo'] = old!;
  }
});
