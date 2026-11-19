import type { LocationRef } from '../pricing/types.js';

export interface ApprovedLocalPlace {
  zoneId: LocationRef['zoneId'];
  localityId: string;
}

interface AliasRule {
  zoneId: ApprovedLocalPlace['zoneId'];
  localityId: string;
  aliases: readonly string[];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const PREA_RULES: readonly AliasRule[] = [
  ['caicara-de-baixo', 'caicara de baixo'],
  ['corrego-das-panelas', 'corrego das panelas'],
  ['corrego-dos-anas', 'corrego dos anas'],
  ['guias-monteiros', 'guias monteiros'],
  ['lagoa-do-paraiso', 'lagoa do paraiso'],
  ['lagoa-azul', 'lagoa azul'],
  ['buraco-azul', 'buraco azul'],
  ['cavalo-bravo', 'cavalo bravo'],
  ['barrinha-de-baixo', 'barrinha de baixo'],
  ['triangulo-do-marco', 'triangulo do marco'],
  ['santana-do-acarau', 'santana do acarau'],
  ['prea-beach-villas', 'prea beach villas'],
  ['clube-da-irrancha', 'clube da irrancha'],
  ['casas-eli-lula', 'casas eli lula'],
  ['casa-de-praia-teto-branco', 'casa de praia teto branco'],
  ['vida-ao-vento', 'vida ao vento'],
  ['kite-lodge', 'kite lodge'],
  ['beach-house', 'beach house'],
  ['play-kitie', 'play kitie'],
  ['d3-luna', 'd3 luna'],
  ['vila-prea', 'vila prea'],
  ['cajueirinho', 'cajueirinho'],
  ['castelhano', 'castelhano'],
  ['carrapateiras', 'carrapateiras'],
  ['pinguela', 'pinguela'],
  ['lagamar', 'lagamar'],
  ['munzua', 'munzua'],
  ['aranau', 'aranau'],
  ['formosa', 'formosa'],
  ['caicara', 'caicara'],
  ['laguim', 'laguim'],
  ['cabana', 'cabana'],
  ['ranchos', 'ranchos'],
  ['bela-cruz', 'bela cruz'],
  ['parazinha', 'parazinha'],
  ['itapipoca', 'itapipoca'],
  ['morrinhos', 'morrinhos'],
  ['amontada', 'amontada'],
  ['camocim', 'camocim'],
  ['granja', 'granja'],
  ['itarema', 'itarema'],
  ['sobral', 'sobral'],
  ['acarau', 'acarau'],
  ['marco', 'marco'],
  ['cruz', 'cruz'],
  ['ius', 'ius'],
].map((entry) => ({
  zoneId: 'prea' as const,
  localityId: entry[0]!,
  aliases: [entry[1]!],
}));

const JIJOCA_RULES: readonly AliasRule[] = [
  ['corrego-da-forquilha-ii', 'corrego da forquilha ii'],
  ['corrego-da-forquilha-i', 'corrego da forquilha i'],
  ['corrego-do-mourao', 'corrego do mourao'],
  ['corrego-do-urubu', 'corrego do urubu'],
  ['corrego-perdido', 'corrego perdido'],
  ['corrego-de-dentro', 'corrego de dentro'],
  ['cruzeiro-do-brandao', 'cruzeiro do brandao'],
  ['lagoa-das-pedras', 'lagoa das pedras'],
  ['vila-sao-paulo', 'vila sao paulo'],
  ['carro-quebrado', 'carro quebrado'],
  ['caminho-mangue-seco', 'caminho para mangue seco'],
  ['proximo-mangue-seco', 'proximo ao mangue seco'],
  ['mangue-seco', 'mangue seco'],
  ['chapadinha', 'chapadinha'],
  ['baixio', 'baixio'],
].map((entry) => ({
  zoneId: 'jijoca' as const,
  localityId: entry[0]!,
  aliases: [entry[1]!],
}));

const SPECIFIC_RULES = [...PREA_RULES, ...JIJOCA_RULES].sort(
  (a, b) =>
    Math.max(...b.aliases.map((item) => item.length)) -
    Math.max(...a.aliases.map((item) => item.length)),
);

const NAME_ONLY_LOCALITY_IDS = new Set([
  'triangulo-do-marco',
  'santana-do-acarau',
  'bela-cruz',
  'parazinha',
  'itapipoca',
  'morrinhos',
  'amontada',
  'camocim',
  'granja',
  'itarema',
  'sobral',
  'acarau',
  'marco',
  'cruz',
]);

function containsAlias(text: string, alias: string): boolean {
  if (!text || !alias) return false;
  return ` ${text} `.includes(` ${alias} `);
}

export function resolveApprovedLocalPlace(input: {
  name: string;
  address: string;
  addressComponentNames?: readonly string[];
}): ApprovedLocalPlace | null {
  const name = normalize(input.name);
  const address = normalize(input.address);
  const components = (input.addressComponentNames ?? []).map(normalize);

  // Aeroporto precisa ser reconhecido antes de municípios presentes
  // no endereço (por exemplo "Cruz - CE").
  if (containsAlias(name, 'aeroporto regional de jericoacoara') ||
      containsAlias(name, 'aeroporto de jericoacoara') ||
      containsAlias(name, 'airport jjd')) {
    return { zoneId: 'external', localityId: 'airport-jjd' };
  }

  for (const rule of SPECIFIC_RULES) {
    const nameOnly = NAME_ONLY_LOCALITY_IDS.has(rule.localityId);
    for (const rawAlias of rule.aliases) {
      const alias = normalize(rawAlias);
      if (
        containsAlias(name, alias) ||
        (!nameOnly &&
          (
            containsAlias(address, alias) ||
            components.some((component) =>
              containsAlias(component, alias)
            )
          ))
      ) {
        return {
          zoneId: rule.zoneId,
          localityId: rule.localityId,
        };
      }
    }
  }

  // Hubs usam o nome do lugar, não o endereço inteiro, para evitar que
  // "Jijoca de Jericoacoara" classifique qualquer hotel local como Jeri.
  if (containsAlias(name, 'jericoacoara')) {
    return { zoneId: 'jericoacoara', localityId: 'jericoacoara' };
  }
  if (containsAlias(name, 'jijoca')) {
    return { zoneId: 'jijoca', localityId: 'jijoca' };
  }
  if (containsAlias(name, 'prea')) {
    return { zoneId: 'prea', localityId: 'prea' };
  }

  return null;
}
