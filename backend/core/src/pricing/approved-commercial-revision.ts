import { PREA_LOCALITIES, JIJOCA_LOCALITIES } from './catalog.v1.js';
import type { PricingCatalogSnapshot } from './catalog-snapshot.js';

/** Approved with Ian on 2026-10-03. Does not mutate historical snapshots. */
export function applyApprovedCommercialRevision(source: PricingCatalogSnapshot): PricingCatalogSnapshot {
  const catalog = structuredClone(source);
  catalog.catalogVersion = 'approved-2026-10-03';
  Object.assign(catalog.localities.prea,structuredClone(PREA_LOCALITIES));
  Object.assign(catalog.localities.jijoca,structuredClone(JIJOCA_LOCALITIES));
  catalog.commercialPolicy = {
    revision: '2026-10-03', jijocaNightBps: 3000, jijocaComfortCents: 1700,
    preaBuggyAfter22Cents: 500, buggyPerAdditionalPassengerCents: 200,
    deliveryBaseCents: 600, deliveryIncludedKm: 5, deliveryPerExcessKmCents: 100,
    jeriTransferDestinationIds: ['prea', 'jijoca', 'airport-jjd', 'fortaleza'],
  };
  catalog.sharedTransfers = {
    enabled: false, whatsappPhone: '', buttonLabel: 'Compartilhado · Valor mais acessível',
    messageTemplate: 'Olá! Vim pelo Ramo Nessa e gostaria de consultar preço e disponibilidade para um transfer compartilhado de {origem} para {destino}.',
    routes: [
      {originId: 'jericoacoara', destinationId: 'fortaleza', enabled: true},
      {originId: 'jericoacoara', destinationId: 'airport-jjd', enabled: true},
    ],
  };
  catalog.externalLocalities = [...new Set([...catalog.externalLocalities, 'fortaleza'])].sort();
  catalog.surcharges.preaComfortCents = 2500;
  catalog.surcharges.preaLocalCarAfter22Cents = 500;
  catalog.jeri.buggy.dayBaseCents = 3500;
  catalog.jeri.buggy.after22BaseCents = 5000;
  const localIds = new Set(catalog.surcharges.preaLocalCarAfter22LocalityIds);
  const beachIds = new Set(['prea-beach-villas','play-kitie','cabana','ranchos','vila-prea','clube-da-irrancha','casas-eli-lula','d3-luna','kite-lodge','beach-house','vida-ao-vento','casa-de-praia-teto-branco']);
  const fixedMotoNight = new Set(['prea','formosa','cavalo-bravo']);
  for (const id of Object.keys(PREA_LOCALITIES)) {
    const price = catalog.localities.prea[id]!;
    if (typeof price.moto === 'number') {
      price.after22 = { moto: fixedMotoNight.has(id) ? 1660 : Math.round(price.moto * (beachIds.has(id) || (!localIds.has(id) && id !== 'airport-jjd') ? 1.6 : 1.4)) };
      if (localIds.has(id)) {
        price.buggy = 2500 + price.moto - 700;
        price.car = price.buggy + 500;
      }
    }
    // Delivery is routed by distance, never by this former locality table.
    delete price.delivery;
    catalog.localityPolicies.prea[id] = {
      enabledCategories: [...(price.moto == null ? [] : ['moto' as const]), 'delivery', 'car', 'comfort_black', ...(price.buggy == null ? [] : ['buggy' as const])],
      applyNightSurcharge: localIds.has(id),
    };
  }
  delete catalog.localities.prea.jericoacoara?.moto;
  delete catalog.localities.prea.jericoacoara?.after22;
  catalog.localityPolicies.prea.jericoacoara!.enabledCategories = ['car', 'comfort_black'];
  for (const id of Object.keys(JIJOCA_LOCALITIES)) {
    const price = catalog.localities.jijoca[id]!;
    if (id === 'corrego-do-mourao') price.moto = 4000;
    if (id === 'chapadinha') price.moto = 4500;
    delete price.delivery;
    catalog.localityPolicies.jijoca[id] = {
      enabledCategories: ['moto','delivery','car','comfort_black'], applyNightSurcharge: true,
    };
  }
  const routes = [
    ['jeri-prea-car','jericoacoara','prea','car',13000,15000],
    ['jeri-prea-comfort','jericoacoara','prea','comfort_black',15000,19000],
    ['jeri-prea-buggy','jericoacoara','prea','buggy',11000,15000],
    ['jeri-jijoca-car','jericoacoara','jijoca','car',14000,16000],
    ['jeri-jijoca-comfort','jericoacoara','jijoca','comfort_black',16000,20000],
    ['jeri-airport-car','jericoacoara','airport-jjd','car',20000,20000],
    ['jeri-airport-comfort','jericoacoara','airport-jjd','comfort_black',22000,22000],
    ['jeri-fortaleza-car','jericoacoara','fortaleza','car',80000,80000],
    ['jeri-fortaleza-comfort','jericoacoara','fortaleza','comfort_black',82500,82500],
    ['prea-airport-moto','prea','airport-jjd','moto',6000,8400],
    ['prea-airport-car','prea','airport-jjd','car',7000,7000],
    ['prea-airport-comfort','prea','airport-jjd','comfort_black',9000,9000],
    ['prea-jijoca-car','prea','jijoca','car',12000,14000],
    ['prea-jijoca-comfort','prea','jijoca','comfort_black',15000,17000],
  ] as const;
  catalog.fixedRoutes = routes.map(([id,a,b,category,dayCents,after22Cents])=>({id,a,b,category,dayCents,after22Cents}));
  // Keep the locality fallback and the explicit transfer prices consistent.
  catalog.localities.prea['airport-jjd']!.car = 7000;
  catalog.localities.prea.jericoacoara!.car = 13000;
  const longIds = ['cruz','bela-cruz','acarau','marco','triangulo-do-marco','granja','itarema','morrinhos','camocim','amontada','santana-do-acarau','parazinha','itapipoca','sobral'];
  for (const id of longIds) {
    const car = catalog.localities.prea[id]!.car as number;
    catalog.fixedRoutes.push({id:`prea-${id}-comfort`,a:'prea',b:id,category:'comfort_black',dayCents:Math.round(car*1.3),after22Cents:Math.round(car*1.3)});
  }
  return catalog;
}
