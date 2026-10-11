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
  buggy?: PriceValue;
  after22?: Partial<Record<ServiceCategory, PriceValue>>;
}

export const COMMISSION_BPS = 1000;
export const FREE_PICKUP_KM = 8;
export const FUEL_PRICE_CENTS_PER_LITER = 700;
export const MOTO_REFERENCE_KM_PER_LITER = 30;
export const CAR_REFERENCE_KM_PER_LITER = 9;

export const PREA_COMFORT_SURCHARGE_CENTS = 4000;
export const JERI_DELIVERY_ABOVE_MAX_CENTS = 600;
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
  'formosa': { moto: 700, delivery: 700, car: 2500 },
  'cavalo-bravo': { moto: 700, delivery: 700, car: 2500 },
  'caicara': { moto: 1400, delivery: 1400, car: 3000 },
  'laguim': { moto: 900, delivery: 900, car: 2500 },
  'buraco-azul': { moto: 1900, delivery: 1900, car: 3500 },
  'caicara-de-baixo': { moto: 2700, delivery: 2700, car: 4500 },
  'corrego-dos-anas': { moto: 2300, delivery: 2300, car: 4000 },
  'corrego-das-panelas': { moto: 4500, delivery: 4500, car: 6000 },
  'guias-monteiros': { moto: 3000, delivery: 3000, car: 4500 },
  'airport-jjd': { moto: 6000, delivery: 6000, car: 18000 },
  'cajueirinho': { moto: 4000, delivery: 4000, car: 5000 },
  'lagoa-azul': { moto: 5000, delivery: 5000, car: 6000 },
  'lagoa-do-paraiso': { moto: 9000, delivery: 9000, car: 11000 },
  'jericoacoara': { moto: 9000, delivery: 9000, car: 14000 },
  'castelhano': { moto: 1800, delivery: 1800, car: 3500 },
  // ID interno estável; nome comercial: Quilombo Córrego dos Iús.
  'ius': { moto: 3000, delivery: 3000, car: 4500 },
  'barrinha-de-baixo': { moto: 3000, delivery: 3000, car: 4500 },
  'pinguela': { moto: 3000, delivery: 3000, car: 4500 },
  'lagamar': { moto: 5000, delivery: 5000, car: 6000 },
  'munzua': { moto: 5000, delivery: 5000, car: 6000 },
  'carrapateiras': { moto: 3500, delivery: 3500, car: 4500 },
  'aranau': { moto: 6000, delivery: 6000, car: 7000 },

  'prea-beach-villas': { moto: 700, delivery: 700, car: 2000 },
  'play-kitie': { moto: 700, delivery: 700, car: 2000 },
  'cabana': { moto: 700, delivery: 700, car: 2000 },
  'ranchos': { moto: 700, delivery: 700, car: 2000 },
  'vila-prea': { moto: 700, delivery: 700, car: 2000 },
  'clube-da-irrancha': { moto: 900, delivery: 700, car: 2500 },
  'casas-eli-lula': { moto: 900, delivery: 700, car: 2700 },
  'd3-luna': { moto: 900, delivery: 700, car: 2700 },
  'kite-lodge': { moto: 1000, delivery: 800, car: 2700 },
  'beach-house': { moto: 1300, delivery: 1000, car: 2700 },
  'vida-ao-vento': { moto: 1300, delivery: 1000, car: 2700 },
  'casa-de-praia-teto-branco': { moto: 1500, delivery: 1000, car: 3300 },

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
  'jijoca': { moto: 1000, delivery: 500, car: 4500 },
  'vila-sao-paulo': { moto: 1500, delivery: 1000, car: 4500 },
  'corrego-da-forquilha-i': { moto: 1500, delivery: 1000, car: 5000 },
  'corrego-do-urubu': { moto: 1500, delivery: 1000, car: 5000 },
  'corrego-da-forquilha-ii': { moto: 2000, delivery: 1500, car: 5500 },
  'carro-quebrado': { moto: 2000, delivery: 2000, car: 5500 },
  'baixio': { moto: 2000, delivery: 2000, car: 6000 },
  'corrego-perdido': { moto: 2500, delivery: 2500, car: 6500 },
  'cruzeiro-do-brandao': { moto: 3000, delivery: 3000, car: 6500 },
  'corrego-de-dentro': { moto: 3000, delivery: 3000, car: 6500 },
  'lagoa-das-pedras': { moto: 3500, delivery: 3500, car: 7000 },
  'corrego-do-mourao': {
    moto: { minCents: 3500, maxCents: 4000 },
    delivery: { minCents: 3500, maxCents: 4000 },
    car: 7500,
  },
  'chapadinha': {
    moto: { minCents: 4000, maxCents: 4500 },
    delivery: { minCents: 4000, maxCents: 4500 },
    car: 8000,
  },
  'caminho-mangue-seco': { moto: 5000, delivery: 5000, car: 8000 },
  'proximo-mangue-seco': { moto: 5500, delivery: 5500, car: 8000 },
  'mangue-seco': { moto: 6000, delivery: 6000, car: 9000 },
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
    id: 'prea-airport-moto',
    a: 'prea',
    b: 'airport-jjd',
    category: 'moto',
    dayCents: 6000,
    after22Cents: 8000,
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
  // Viagens longas mantêm os valores de Comfort aprovados no documento
  // revisado. Isso preserva +R$ 50 nessas rotas, enquanto o Comfort local
  // do Preá/Beira-Mar usa o adicional configurável de R$ 40.
  {
    id: 'prea-cruz-comfort',
    a: 'prea',
    b: 'cruz',
    category: 'comfort_black',
    dayCents: 17000,
    after22Cents: 17000,
  },
  {
    id: 'prea-bela-cruz-comfort',
    a: 'prea',
    b: 'bela-cruz',
    category: 'comfort_black',
    dayCents: 23000,
    after22Cents: 23000,
  },
  {
    id: 'prea-acarau-comfort',
    a: 'prea',
    b: 'acarau',
    category: 'comfort_black',
    dayCents: 24000,
    after22Cents: 24000,
  },
  {
    id: 'prea-marco-comfort',
    a: 'prea',
    b: 'marco',
    category: 'comfort_black',
    dayCents: 30000,
    after22Cents: 30000,
  },
  {
    id: 'prea-triangulo-do-marco-comfort',
    a: 'prea',
    b: 'triangulo-do-marco',
    category: 'comfort_black',
    dayCents: 31000,
    after22Cents: 31000,
  },
  {
    id: 'prea-granja-comfort',
    a: 'prea',
    b: 'granja',
    category: 'comfort_black',
    dayCents: 31000,
    after22Cents: 31000,
  },
  {
    id: 'prea-itarema-comfort',
    a: 'prea',
    b: 'itarema',
    category: 'comfort_black',
    dayCents: 31000,
    after22Cents: 31000,
  },
  {
    id: 'prea-morrinhos-comfort',
    a: 'prea',
    b: 'morrinhos',
    category: 'comfort_black',
    dayCents: 37000,
    after22Cents: 37000,
  },
  {
    id: 'prea-camocim-comfort',
    a: 'prea',
    b: 'camocim',
    category: 'comfort_black',
    dayCents: 40000,
    after22Cents: 40000,
  },
  {
    id: 'prea-amontada-comfort',
    a: 'prea',
    b: 'amontada',
    category: 'comfort_black',
    dayCents: 41000,
    after22Cents: 41000,
  },
  {
    id: 'prea-santana-do-acarau-comfort',
    a: 'prea',
    b: 'santana-do-acarau',
    category: 'comfort_black',
    dayCents: 45000,
    after22Cents: 45000,
  },
  {
    id: 'prea-parazinha-comfort',
    a: 'prea',
    b: 'parazinha',
    category: 'comfort_black',
    dayCents: 53000,
    after22Cents: 53000,
  },
  {
    id: 'prea-itapipoca-comfort',
    a: 'prea',
    b: 'itapipoca',
    category: 'comfort_black',
    dayCents: 55000,
    after22Cents: 55000,
  },
  {
    id: 'prea-sobral-comfort',
    a: 'prea',
    b: 'sobral',
    category: 'comfort_black',
    dayCents: 57000,
    after22Cents: 57000,
  }
];

export function valueForPeriod(
  dayCents: number,
  after22Cents: number,
  period: PricePeriod,
): number {
  return period === 'after_22' ? after22Cents : dayCents;
}
