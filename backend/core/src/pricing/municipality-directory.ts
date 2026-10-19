import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import type { ZoneId } from './types.js';

export type MunicipalityAssignment = {
  municipalityId: string | null;
  status: 'confirmed' | 'pending_review';
  sourceUrl: string | null;
};

export const LOCAL_SERVICE_MUNICIPALITIES = ['cruz', 'jijoca-de-jericoacoara'] as const;
export const MUNICIPALITY_LABELS: Record<string,string> = {
  cruz:'Cruz/CE', 'jijoca-de-jericoacoara':'Jijoca de Jericoacoara/CE',
  acarau:'Acaraú/CE', amontada:'Amontada/CE', 'bela-cruz':'Bela Cruz/CE',
  camocim:'Camocim/CE', granja:'Granja/CE', itapipoca:'Itapipoca/CE',
  itarema:'Itarema/CE', marco:'Marco/CE', morrinhos:'Morrinhos/CE',
  'santana-do-acarau':'Santana do Acaraú/CE', sobral:'Sobral/CE',
};
const IBGE = 'https://www.ibge.gov.br/explica/codigos-dos-municipios.php';
const CRUZ = 'https://prefeitura.cruz.ce.gov.br/transparencia-municipal/portal-de-licitacoes/licitacao/pe-2123-seduc/';
const JIJOCA = 'https://www.jijocadejericoacoara.ce.gov.br/informa/1974/d-vidas-frequentes';
const COMMUNITY = 'https://jijocadejericoacoara.ce.gov.br/conselhos.php?id=13&tp=';
const PROJECTS = 'https://www.cidades.ce.gov.br/wp-content/uploads/sites/12/2026/03/Resultado-Preliminar-MI-001_2026-SITE.pdf';
const AIRPORT = 'https://www.ce.gov.br/2026/03/10/aditivo-que-concede-gestao-do-aeroporto-de-jericoacoara-a-fraport-e-assinado-em-brasilia/';
const BARRINHA = 'https://www.acarau.ce.gov.br/ambientalarq/439/2856/arq_24.11.190001_indeferidopelosetortecnico.pdf';
const ARANAU = 'https://www.ibge.gov.br/biblioteca/visualizacao/dtb/ceara/acarau.pdf';
const TRIANGULO = 'https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/detalhes/proc/55322/licit/44447';
const LAGOON = 'https://www.jijocadejericoacoara.ce.gov.br/informa/1973/atrativos-tur-sticos';

const known = (municipalityId:string,sourceUrl:string): MunicipalityAssignment =>
  ({municipalityId,status:'confirmed',sourceUrl});
const names = ['acarau','amontada','bela-cruz','camocim','cruz','granja',
  'itapipoca','itarema','marco','morrinhos','santana-do-acarau','sobral'];
const cities = Object.fromEntries(names.map(id=>[id,known(id,IBGE)]));
const cruz = known('cruz',CRUZ);
const jijoca = known('jijoca-de-jericoacoara',JIJOCA);

export const BASE_MUNICIPALITIES: Record<ZoneId,Record<string,MunicipalityAssignment>> = {
  prea: {
    ...Object.fromEntries(['prea','vila-prea','cavalo-bravo','formosa','caicara',
      'caicara-de-baixo','cajueirinho','corrego-dos-anas','corrego-das-panelas',
      'lagoa-azul'].map(id=>[id,cruz])),
    ...cities,
    'airport-jjd':known('cruz',AIRPORT),
    'barrinha-de-baixo':known('acarau',BARRINHA),
    'aranau':known('acarau',ARANAU),
    'triangulo-do-marco':known('marco',TRIANGULO),
    'jijoca':jijoca,'jericoacoara':jijoca,
    'lagoa-do-paraiso':known('jijoca-de-jericoacoara',LAGOON),
  },
  jijoca: {
    'jijoca':jijoca,
    ...Object.fromEntries(['baixio','chapadinha','mangue-seco']
      .map(id=>[id,known('jijoca-de-jericoacoara',COMMUNITY)])),
    ...Object.fromEntries(['carro-quebrado','corrego-da-forquilha-i',
      'corrego-da-forquilha-ii','corrego-do-mourao','corrego-do-urubu',
      'corrego-perdido','cruzeiro-do-brandao','lagoa-das-pedras']
      .map(id=>[id,known('jijoca-de-jericoacoara',PROJECTS)])),
  },
  jericoacoara:{jericoacoara:jijoca},
  external:{
    ...cities,
    'airport-jjd':known('cruz',AIRPORT),
    'triangulo-do-marco':known('marco',TRIANGULO),
  },
};
export const PENDING_MUNICIPALITY: MunicipalityAssignment =
  {municipalityId:null,status:'pending_review',sourceUrl:null};

export function municipalityFor(
  catalog: PricingCatalogSnapshot,zoneId:ZoneId,localityId:string|undefined,
): MunicipalityAssignment {
  if (!localityId) return PENDING_MUNICIPALITY;
  return catalog.municipalityOverrides?.[zoneId]?.[localityId] ??
    BASE_MUNICIPALITIES[zoneId][localityId] ?? PENDING_MUNICIPALITY;
}
export function isLocalServiceMunicipality(assignment:MunicipalityAssignment):boolean {
  return assignment.status === 'confirmed' &&
    LOCAL_SERVICE_MUNICIPALITIES.some(id=>id===assignment.municipalityId);
}
export function isKnownOutsideLocalArea(assignment:MunicipalityAssignment):boolean {
  return assignment.status === 'confirmed' && assignment.municipalityId !== null &&
    !isLocalServiceMunicipality(assignment);
}
export function municipalityLabel(assignment:MunicipalityAssignment):string {
  return assignment.municipalityId == null
    ? 'Município a confirmar'
    : MUNICIPALITY_LABELS[assignment.municipalityId] ?? assignment.municipalityId;
}
