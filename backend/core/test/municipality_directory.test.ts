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
