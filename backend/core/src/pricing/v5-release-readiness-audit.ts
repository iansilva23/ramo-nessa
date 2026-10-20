import { FIXED_ROUTES } from './catalog.v1.js';
import { STATIC_PRICING_CATALOG_V1, type PricingCatalogSnapshot } from './catalog-snapshot.js';
import { municipalityFor } from './municipality-directory.js';

type Scope = 'prea' | 'jijoca' | 'external' | 'jericoacoara';
export type RouteDifference = {
  routeId: string;
  legacyDayCents: number;
  revisedDayCents: number;
  legacyNightCents: number;
  revisedNightCents: number;
  changedEndpointsOrCategory: boolean;
};

export type V5ReadinessReport = {
  source: 'static-source-code-only';
  releaseStatus: 'REQUIRES_MANUAL_HOMOLOGATION';
  revisedCatalogVersion: string;
  legacyRouteCount: number;
  revisedRouteCount: number;
  routeDifferences: RouteDifference[];
  legacyRouteIdsMissingFromRevision: string[];
  routeIdsNewInRevision: string[];
  municipalityRecords: number;
  municipalityConfirmed: number;
  pendingMunicipalities: Array<{scope: Scope; localityId: string}>;
  airportComfort: {legacyDayCents: number | null; revisedDayCents: number | null};
};

export function auditV5Readiness(
  catalog: PricingCatalogSnapshot = STATIC_PRICING_CATALOG_V1,
): V5ReadinessReport {
  const legacy = new Map(FIXED_ROUTES.map(route => [route.id, route]));
  const revised = new Map(catalog.fixedRoutes.map(route => [route.id, route]));
  const routeDifferences: RouteDifference[] = [];
  for (const [routeId, old] of legacy) {
    const next = revised.get(routeId);
    if (!next) continue;
    const changedEndpointsOrCategory =
      old.a !== next.a || old.b !== next.b || old.category !== next.category;
    if (!changedEndpointsOrCategory && old.dayCents === next.dayCents &&
        old.after22Cents === next.after22Cents) continue;
    routeDifferences.push({
      routeId, legacyDayCents: old.dayCents, revisedDayCents: next.dayCents,
      legacyNightCents: old.after22Cents, revisedNightCents: next.after22Cents,
      changedEndpointsOrCategory,
    });
  }
  routeDifferences.sort((a, b) => a.routeId.localeCompare(b.routeId));
  const scopes: Record<Scope, string[]> = {
    prea: Object.keys(catalog.localities.prea),
    jijoca: Object.keys(catalog.localities.jijoca),
    external: [...catalog.externalLocalities],
    jericoacoara: ['jericoacoara'],
  };
  const pendingMunicipalities: V5ReadinessReport['pendingMunicipalities'] = [];
  let municipalityRecords = 0;
  let municipalityConfirmed = 0;
  for (const scope of Object.keys(scopes) as Scope[]) {
    for (const localityId of scopes[scope]) {
      municipalityRecords++;
      const assignment = municipalityFor(catalog, scope, localityId);
      if (assignment.status === 'confirmed' &&
          assignment.municipalityId !== null && assignment.sourceUrl !== null) {
        municipalityConfirmed++;
      } else {
        pendingMunicipalities.push({scope, localityId});
      }
    }
  }
  pendingMunicipalities.sort((a, b) =>
    a.scope.localeCompare(b.scope) || a.localityId.localeCompare(b.localityId));

  return {
    source: 'static-source-code-only',
    releaseStatus: 'REQUIRES_MANUAL_HOMOLOGATION',
    revisedCatalogVersion: catalog.catalogVersion,
    legacyRouteCount: legacy.size,
    revisedRouteCount: revised.size,
    routeDifferences,
    legacyRouteIdsMissingFromRevision: [...legacy.keys()]
      .filter(id => !revised.has(id)).sort(),
    routeIdsNewInRevision: [...revised.keys()]
      .filter(id => !legacy.has(id)).sort(),
    municipalityRecords,
    municipalityConfirmed,
    pendingMunicipalities,
    airportComfort: {
      legacyDayCents: legacy.get('jeri-airport-comfort')?.dayCents ?? null,
      revisedDayCents: revised.get('jeri-airport-comfort')?.dayCents ?? null,
    },
  };
}

export function formatV5ReadinessMarkdown(report: V5ReadinessReport): string {
  const brl = (cents: number | null) =>
    cents === null ? 'ausente' : 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
  return [
    '# Ramo Nessa V5 — Auditoria estática pré-lançamento',
    '',
    '**NÃO LIBERADO PARA PRODUÇÃO — SEM ALTERAÇÃO DE TARIFAS.**',
    '',
    'Fonte: somente código estático do repositório. Não consulta banco PostgreSQL vigente, Google ou VPS.',
    'Versão de revisão: ' + report.revisedCatalogVersion,
    '',
    '## Tarifas fixas',
    'Legado: ' + report.legacyRouteCount +
      '; revisão: ' + report.revisedRouteCount +
      '; diferenças em IDs existentes: ' + report.routeDifferences.length + '.',
    '',
    'Jeri → Aeroporto JJD Comfort/Black: **' +
      brl(report.airportComfort.legacyDayCents) + ' (legado)** versus **' +
      brl(report.airportComfort.revisedDayCents) +
      ' (revisão)**. Requer decisão comercial explícita.',
    '',
    '| Rota | Dia legado | Dia revisão | Noite legado | Noite revisão | Extremos/categoria alterados |',
    '|---|---:|---:|---:|---:|---|',
    ...report.routeDifferences.map(row =>
      '| ' + row.routeId + ' | ' + brl(row.legacyDayCents) +
      ' | ' + brl(row.revisedDayCents) +
      ' | ' + brl(row.legacyNightCents) +
      ' | ' + brl(row.revisedNightCents) +
      ' | ' + (row.changedEndpointsOrCategory ? 'SIM' : 'não') + ' |'),
    '',
    'IDs legados ausentes na revisão: ' +
      (report.legacyRouteIdsMissingFromRevision.join(', ') || 'nenhum') + '.',
    'Novos IDs na revisão: ' +
      (report.routeIdsNewInRevision.join(', ') || 'nenhum') + '.',
    '',
    '## Municípios',
    'Registros: ' + report.municipalityRecords +
      '; confirmados documentalmente: ' + report.municipalityConfirmed +
      '; pendentes: ' + report.pendingMunicipalities.length + '.',
    '',
    ...report.pendingMunicipalities.map(row =>
      '- ' + row.scope + '/' + row.localityId),
    '',
    '## Limitações e autorização',
    '- Diferença entre versões de código não significa necessariamente erro ou falta de aprovação anterior.',
    '- Este arquivo não sabe qual catálogo está realmente publicado no banco.',
    '- Município documental não significa geocerca GPS comprovada ou licença operacional.',
    '- Exige homologação em aparelhos físicos, APIs externas autorizadas, backup, rollback e aceite comercial humano.',
    '- Nunca alterar tarifas automaticamente com base neste relatório.',
    '',
  ].join('\n');
}
