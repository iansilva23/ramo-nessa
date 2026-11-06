// Pure, read-only catalogue projection. Never calculates an authoritative fare:
 // values here are previews for the Admin editor, not dispatch quotes.
function exact(value) {
  return Number.isFinite(value) ? {kind: 'exact', amountCents: value} : null;
}
function fromValue(value) {
  return value?.kind === 'exact' || value?.kind === 'range' ? value : null;
}
function scale(value, factor = 1, add = 0) {
  if (!value) return null;
  if (value.kind === 'exact') return exact(Math.round(value.amountCents * factor) + add);
  return { kind: 'range',
    minCents: Math.round(value.minCents * factor) + add,
    maxCents: Math.round(value.maxCents * factor) + add,
  };
}
function regionNight(entry, hub, category, catalog, day) {
  const prices = entry.prices ?? {};
  const custom = fromValue(prices.after22?.[category]);
  if (custom) return {price: custom, mode: 'manual'};
  if (!day) return {price: null, mode: 'indisponivel'};
  const commercial = catalog.commercialPolicy ?? {};
  const policy = entry.policy ?? {};
  if (hub === 'prea') {
    if (category === 'buggy') return {
      price: scale(day, 1, commercial.preaBuggyAfter22Cents ?? 0),
      mode: 'automatico',
    };
    if (category === 'car' || category === 'comfort_black') return {
      price: scale(day, 1,
        policy.applyNightSurcharge
          ? catalog.surcharges?.preaLocalCarAfter22Cents ?? 0 : 0),
      mode: 'automatico',
    };
    return {price: day, mode: 'automatico'};
  }
  const factor = policy.applyNightSurcharge
    ? 1 + (commercial.jijocaNightBps ?? 0) / 10000 : 1;
  return {price: scale(day, factor), mode: 'automatico'};
}
function localFare(entry, hub, category, catalog) {
  const prices = entry.prices ?? {};
  const commercial = catalog.commercialPolicy;
  if (category === 'delivery' && commercial) {
    return null; // Its authoritative fare is deliveryBase + distance, not the legacy locality field.
  }
  if (hub === 'jijoca' && category === 'buggy') return null;
  if (category !== 'comfort_black') {
    const day = fromValue(prices[category]);
    const night = regionNight(entry, hub, category, catalog, day);
    return {day, ...night};
  }
  const premium = hub === 'prea'
    ? catalog.surcharges?.preaComfortCents ?? 0
    : commercial?.jijocaComfortCents ?? 0;
  const explicit = fromValue(prices.comfort_black);
  const carDay = fromValue(prices.car);
  const day = explicit ?? scale(carDay, 1, premium);
  const manualNight = fromValue(prices.after22?.comfort_black);
  if (manualNight) return {day, price: manualNight, mode: 'manual'};
  if (explicit) return {day, ...regionNight(entry, hub, category, catalog, day)};
  // A Car night override is an absolute Car tariff, before the Comfort premium.
  const carNight = regionNight(entry, hub, 'car', catalog, carDay);
  return {day, price: scale(carNight.price, 1, premium), mode: 'automatico'};
}
const labelFor = {moto:'Mototáxi',car:'Carro',comfort_black:'Comfort/Black',buggy:'Buggy',delivery:'Entrega'};
export function buildPricingRateRows(catalog) {
  if (!catalog) return [];
  const out = [];
  for (const route of catalog.fixedRoutes ?? []) {
    out.push({key:'route:'+route.id,kind:'fixed_route',region:'transfer',
      label:route.a+' ↔ '+route.b,category:route.category,
      categoryLabel:labelFor[route.category] ?? route.category,
      day:exact(route.dayCents),night:exact(route.after22Cents),
      mode:'definido',routeId:route.id});
  }
  for (const hub of ['prea','jijoca']) {
    const rows = catalog.localities?.[hub] ?? [];
    for (const entry of rows) {
      for (const category of ['moto','car','comfort_black','buggy','delivery']) {
        if (category === 'delivery' && catalog.commercialPolicy) continue;
        if (hub === 'jijoca' && category === 'buggy') continue;
        const fare = localFare(entry, hub, category, catalog);
        if (!fare) continue;
        const enabled = entry.policy?.enabledCategories?.includes(category) === true;
        if (!enabled && !fare.day && !fare.price) continue;
        out.push({key:hub+':'+entry.localityId+':'+category,
          kind:'locality_price',region:hub,localityId:entry.localityId,
          label:catalog.localityDisplayNames?.[hub]?.[entry.localityId] ??
            entry.localityId,category,categoryLabel:labelFor[category] ?? category,
          enabled,day:fare.day,night:fare.price,mode:fare.mode});
      }
    }
  }
  if (catalog.commercialPolicy) {
    const base=exact(catalog.commercialPolicy.deliveryBaseCents);
    out.push({key:'regional-delivery',kind:'commercial_policy',region:'regional',
      label:'Preá e Jijoca · base + km excedente',category:'delivery',
      categoryLabel:'Entrega',day:base,night:base,mode:'sem-adicional'});
  }
  if (catalog.jeri?.buggy) {
    out.push({key:'jeri-buggy',kind:'buggy_policy',region:'jericoacoara',
      label:'Jericoacoara · valor base + adicional por passageiro',category:'buggy',
      categoryLabel:'Buggy',day:exact(catalog.jeri.buggy.dayBaseCents),
      night:exact(catalog.jeri.buggy.after22BaseCents),mode:'definido'});
  }
  if (catalog.jeri?.deliveryBands?.length) {
    out.push({key:'jeri-delivery',kind:'delivery_bands',region:'jericoacoara',
      label:'Jericoacoara · faixas por km',category:'delivery',
      categoryLabel:'Entrega',day:null,night:null,mode:'sem-adicional'});
  }
  for (const rule of catalog.distanceFarePolicies ?? []) {
    out.push({key:'distance:'+rule.id,kind:'distance_fare_policy',
      region:rule.anchorZoneId,label:(rule.scope==='intra_zone'
        ? 'Entre localidades autorizadas' : 'Ponto-base')+
        ' · '+rule.anchorLocalityId,category:rule.category,
      categoryLabel:labelFor[rule.category] ?? rule.category,
      day:exact(rule.minimumFareCents),
      night:exact(rule.scope==='intra_zone'
        ? rule.after22MinimumFareCents : rule.minimumFareCents),
      mode:rule.scope==='intra_zone'?'por-km-noturno':'por-km',
      distanceRuleId:rule.id});
  }
  return out;
}
export function formatPriceView(value) {
  if (value == null) return '—';
  const money = cents => Number(cents / 100).toLocaleString('pt-BR',
    {style:'currency',currency:'BRL'});
  return value.kind === 'range'
    ? money(value.minCents)+'–'+money(value.maxCents)
    : money(value.amountCents);
}
export function nightDifference(day, night) {
  if (day?.kind !== 'exact' || night?.kind !== 'exact') return null;
  return night.amountCents-day.amountCents;
}
