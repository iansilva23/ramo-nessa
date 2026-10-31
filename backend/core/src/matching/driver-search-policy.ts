import type { ServiceCategory } from '../pricing/types.js';

export const SEARCH_CATEGORIES: ServiceCategory[] = ['moto', 'car', 'delivery', 'comfort_black', 'buggy'];
export interface PickupFeeTier { upToKm: number; amountCents: number }
export interface CategoryDriverSearchPolicy {
  nearbyKm: number;
  expandedKm: number;
  allowExpansion: boolean;
  useCustomPickupFees: boolean;
  pickupFees: PickupFeeTier[];
}
export type DriverSearchPolicy = Record<ServiceCategory, CategoryDriverSearchPolicy>;

export function defaultDriverSearchPolicy(nearbyKm = 5): DriverSearchPolicy {
  return Object.fromEntries(SEARCH_CATEGORIES.map(category => [category, {
    nearbyKm, expandedKm: Math.max(15, nearbyKm), allowExpansion: false,
    useCustomPickupFees: false, pickupFees: [],
  }])) as unknown as DriverSearchPolicy;
}

export function validateDriverSearchPolicy(value: unknown): DriverSearchPolicy {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Política de busca inválida.');
  const result = {} as DriverSearchPolicy;
  for (const category of SEARCH_CATEGORIES) {
    const item = (value as Record<string, unknown>)[category];
    if (item == null || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Configure a categoria ${category}.`);
    const p = item as CategoryDriverSearchPolicy;
    if (!Number.isFinite(p.nearbyKm) || p.nearbyKm < 0.5 || p.nearbyKm > 100 ||
        !Number.isFinite(p.expandedKm) || p.expandedKm < p.nearbyKm || p.expandedKm > 100 ||
        typeof p.allowExpansion !== 'boolean' || typeof p.useCustomPickupFees !== 'boolean' ||
        !Array.isArray(p.pickupFees) || p.pickupFees.length > 20) throw new Error(`Limites inválidos para ${category}.`);
    let previous = 0;
    const tiers: PickupFeeTier[] = [];
    for (const tier of p.pickupFees) {
      if (tier == null || typeof tier !== 'object' || !Number.isFinite(tier.upToKm) ||
          tier.upToKm <= previous || tier.upToKm > 100 || !Number.isSafeInteger(tier.amountCents) ||
          tier.amountCents < 0 || tier.amountCents > 100_000) throw new Error(`Faixas inválidas para ${category}. Use distâncias crescentes e valores de R$ 0 a R$ 1.000.`);
      tiers.push({ upToKm: tier.upToKm, amountCents: tier.amountCents }); previous = tier.upToKm;
    }
    if (p.useCustomPickupFees && previous < (p.allowExpansion ? p.expandedKm : p.nearbyKm)) {
      throw new Error(`As faixas de ${category} precisam cobrir toda a distância de busca.`);
    }
    result[category] = { nearbyKm: p.nearbyKm, expandedKm: p.expandedKm,
      allowExpansion: p.allowExpansion, useCustomPickupFees: p.useCustomPickupFees, pickupFees: tiers };
  }
  return result;
}

export function selectedDriverSearchRadius(policy: CategoryDriverSearchPolicy, requested?: number): number {
  const radius = requested ?? policy.nearbyKm;
  if (!Number.isFinite(radius) || radius < 0.5 || radius > policy.expandedKm ||
      (radius > policy.nearbyKm && !policy.allowExpansion)) throw new Error('A ampliação de busca não está habilitada para esta categoria.');
  return radius;
}

export function customPickupFee(policy: CategoryDriverSearchPolicy, routedKm: number): number | undefined {
  if (!policy.useCustomPickupFees) return undefined;
  if (!Number.isFinite(routedKm) || routedKm < 0) throw new Error('Distância de coleta inválida.');
  const tier = policy.pickupFees.find(t => routedKm <= t.upToKm);
  if (tier == null) throw new Error('A distância de coleta não possui faixa configurada.');
  return tier.amountCents;
}
