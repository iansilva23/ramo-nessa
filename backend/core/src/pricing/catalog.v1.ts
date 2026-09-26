import type { PricePeriod, ServiceCategory } from './types.js';

export interface PriceBand {
  minCents: number;
  maxCents: number;
}

export type PriceValue = number | PriceBand;

export interface LocalityPricing {
  moto?: PriceValue;
  delivery?: PriceValue;
  car?: PriceValue;
}

export const COMMISSION_BPS = 1000;
export const FREE_PICKUP_KM = 3;
export const FUEL_PRICE_CENTS_PER_LITER = 700;
export const MOTO_REFERENCE_KM_PER_LITER = 30;
export const CAR_REFERENCE_KM_PER_LITER = 9;

export const PREA_COMFORT_SURCHARGE_CENTS = 5000;
export const PREA_LOCAL_CAR_NIGHT_SURCHARGE_CENTS = 1000;

export const PREA_LOCAL_CAR_NIGHT_LOCALITY_IDS: ReadonlySet<string> = new Set([
  'prea',
  'formosa',
  'cavalo-bravo',
  'caicara',
  'laguim',
  'buraco-azul',
  'caicara-de-baixo',
  'corrego-dos-anas',
  'corrego-das-panelas',
  'guias-monteiros',
  'cajueirinho',
  'lagoa-azul',
  'lagoa-do-paraiso',
  'castelhano',
  'ius',
  'barrinha-de-baixo',
  'pinguela',
  'lagamar',
  'munzua',
  'carrapateiras',
  'aranau',
  'prea-beach-villas',
  'play-kitie',
  'cabana',
  'ranchos',
  'vila-prea',
  'clube-da-irrancha',
  'casas-eli-lula',
  'd3-luna',
  'kite-lodge',
  'beach-house',
  'vida-ao-vento',
  'casa-de-praia-teto-branco',
]);

export const PREA_LOCALITIES: Record<string, LocalityPricing> = {
  'prea': { moto: 700, delivery: 700, car: 2500 },
  'formosa': { moto: { minCents: 800, maxCents: 1000 }, delivery: { minCents: 800, maxCents: 1000 }, car: 2500 },
  'cavalo-bravo': { moto: { minCents: 800, maxCents: 1000 }, delivery: { minCents: 800, maxCents: 1000 }, car: 2500 },
  'caicara': { moto: 1500, delivery: 1500, car: 3000 },
  'laguim': { moto: 1000, delivery: 1000, car: 2500 },
  'buraco-azul': { moto: 2000, delivery: 2000, car: 3500 },
  'caicara-de-baixo': { moto: 3000, delivery: 3000, car: 4500 },
  'corrego-dos-anas': { moto: 2500, delivery: 2500, car: 4000 },
  'corrego-das-panelas': { moto: 5000, delivery: 5000, car: 6000 },
  'guias-monteiros': { moto: 3500, delivery: 3500, car: 4500 },
  'airport-jjd': { moto: 6000, delivery: 6000, car: 18000 },
  'cajueirinho': { moto: 4000, delivery: 4000, car: 5000 },
  'lagoa-azul': { moto: 5000, delivery: 5000, car: 6000 },
  'lagoa-do-paraiso': { moto: 10000, delivery: 10000, car: 11000 },
  'jericoacoara': { moto: 10000, delivery: 10000 },
  'castelhano': { moto: 2000, delivery: 2000, car: 3500 },
  'ius': { moto: 3000, delivery: 3000, car: 4500 },
  'barrinha-de-baixo': { moto: 3000, delivery: 3000, car: 4500 },
  'pinguela': { moto: 3000, delivery: 3000, car: 4500 },
  'lagamar': { moto: 5000, delivery: 5000, car: 6000 },
  'munzua': { moto: 5000, delivery: 5000, car: 6000 },
  'carrapateiras': { moto: 3500, delivery: 3500, car: 4500 },
  'aranau': { moto: 6000, delivery: 6000, car: 7000 },

  'prea-beach-villas': { moto: 800, delivery: 800, car: 2500 },
  'play-kitie': { moto: 800, delivery: 800, car: 2500 },
  'cabana': { moto: 800, delivery: 800, car: 2500 },
  'ranchos': { moto: 800, delivery: 800, car: 2500 },
  'vila-prea': { moto: 800, delivery: 800, car: 2500 },
  'clube-da-irrancha': { moto: 1000, delivery: 1000, car: 3000 },
  'casas-eli-lula': { moto: 1000, delivery: 1000, car: 3000 },
  'd3-luna': { moto: 1000, delivery: 1000, car: 3000 },
  'kite-lodge': { moto: 1200, delivery: 1200, car: 3000 },
  'beach-house': { moto: 1500, delivery: 1500, car: 3500 },
  'vida-ao-vento': { moto: 1500, delivery: 1500, car: 3500 },
  'casa-de-praia-teto-branco': { moto: 2000, delivery: 2000, car: 3500 },

  'jijoca': { moto: 6000, delivery: 6000, car: 12000 },
  'cruz': { moto: 8000, delivery: 8000, car: 12000 },
  'bela-cruz': { moto: 15000, delivery: 15000, car: 18000 },
  'acarau': { moto: 10000, delivery: 10000, car: 19000 },
  'marco': { moto: 16000, delivery: 16000, car: 25000 },
  'triangulo-do-marco': { moto: 17000, delivery: 17000, car: 26000 },
  'granja': { moto: 17000, delivery: 17000, car: 26000 },
  'itarema': { moto: 17000, delivery: 17000, car: 26000 },
  'morrinhos': { moto: 19000, delivery: 19000, car: 32000 },
  'camocim': { moto: 20000, delivery: 20000, car: 35000 },
  'amontada': { moto: 25000, delivery: 25000, car: 36000 },
  'santana-do-acarau': { moto: 25000, delivery: 25000, car: 40000 },
  'parazinha': { moto: 14000, delivery: 14000, car: 48000 },
  'itapipoca': { moto: 30000, delivery: 30000, car: 50000 },
  'sobral': { moto: 35000, delivery: 35000, car: 52000 },
};

export const JIJOCA_LOCALITIES: Record<string, LocalityPricing> = {
  'jijoca': { moto: 1000, delivery: 1000, car: 5000 },
  'vila-sao-paulo': { moto: 1500, delivery: 1500, car: 5000 },
  'corrego-da-forquilha-i': { moto: 1500, delivery: 1500, car: 5500 },
  'corrego-do-urubu': { moto: 1500, delivery: 1500, car: 5500 },
  'corrego-da-forquilha-ii': { moto: 2000, delivery: 2000, car: 6000 },
  'carro-quebrado': { moto: 2000, delivery: 2000, car: 6000 },
  'baixio': { moto: 2000, delivery: 2000, car: 6500 },
  'corrego-perdido': { moto: 2500, delivery: 2500, car: 7000 },
  'cruzeiro-do-brandao': { moto: 3000, delivery: 3000, car: 7500 },
  'corrego-de-dentro': { moto: 3000, delivery: 3000, car: 7500 },
  'lagoa-das-pedras': { moto: 3500, delivery: 3500, car: 8000 },
  'corrego-do-mourao': {
    moto: { minCents: 3500, maxCents: 4000 },
    delivery: { minCents: 3500, maxCents: 4000 },
    car: 8500,
  },
  'chapadinha': {
    moto: { minCents: 4000, maxCents: 4500 },
    delivery: { minCents: 4000, maxCents: 4500 },
    car: 9000,
  },
  'caminho-mangue-seco': { moto: 5000, delivery: 5000, car: 9500 },
  'proximo-mangue-seco': { moto: 5500, delivery: 5500, car: 9500 },
  'mangue-seco': { moto: 6000, delivery: 6000, car: 10000 },
};

export interface FixedRoutePrice {
  id: string;
  a: string;
  b: string;
  category: ServiceCategory;
  dayCents: number;
  after22Cents: number;
}

export const FIXED_ROUTES: FixedRoutePrice[] = [
  {
    id: 'jeri-prea-comfort',
    a: 'jericoacoara',
    b: 'prea',
    category: 'comfort_black',
    dayCents: 15000,
    after22Cents: 20000,
  },
  {
    id: 'jeri-jijoca-comfort',
    a: 'jericoacoara',
    b: 'jijoca',
    category: 'comfort_black',
    dayCents: 16000,
    after22Cents: 20000,
  },
  {
    id: 'jeri-airport-comfort',
    a: 'jericoacoara',
    b: 'airport-jjd',
    category: 'comfort_black',
    dayCents: 24000,
    after22Cents: 24000,
  },
  {
    id: 'prea-airport-car',
    a: 'prea',
    b: 'airport-jjd',
    category: 'car',
    dayCents: 18000,
    after22Cents: 18000,
  },
  {
    id: 'prea-airport-comfort',
    a: 'prea',
    b: 'airport-jjd',
    category: 'comfort_black',
    dayCents: 23000,
    after22Cents: 23000,
  },
  {
    id: 'prea-jijoca-car',
    a: 'prea',
    b: 'jijoca',
    category: 'car',
    dayCents: 12000,
    after22Cents: 14000,
  },
  {
    id: 'prea-jijoca-comfort',
    a: 'prea',
    b: 'jijoca',
    category: 'comfort_black',
    dayCents: 17000,
    after22Cents: 19000,
  },
];

export function valueForPeriod(
  dayCents: number,
  after22Cents: number,
  period: PricePeriod,
): number {
  return period === 'after_22' ? after22Cents : dayCents;
}
