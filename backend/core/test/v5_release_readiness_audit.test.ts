import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { auditV5Readiness, formatV5ReadinessMarkdown } from '../src/pricing/v5-release-readiness-audit.js';

test('relatório não altera o catálogo nem inventa aprovação de lançamento', () => {
  const before = structuredClone(STATIC_PRICING_CATALOG_V1);
  const report = auditV5Readiness();
  assert.deepEqual(STATIC_PRICING_CATALOG_V1, before);
  assert.equal(report.source, 'static-source-code-only');
  assert.equal(report.releaseStatus, 'REQUIRES_MANUAL_HOMOLOGATION');
  assert.equal(report.municipalityRecords, 83);
  assert.equal(report.municipalityConfirmed, 57);
  assert.equal(report.pendingMunicipalities.length, 26);
  assert.deepEqual(report.pendingMunicipalities.find(row =>
    row.scope === 'prea' && row.localityId === 'beach-house'),
  { scope: 'prea', localityId: 'beach-house' });
  assert.deepEqual(report.airportComfort,
    {legacyDayCents: 24000, revisedDayCents: 22000});
  assert.ok(report.routeDifferences.some(row =>
    row.routeId === 'jeri-airport-comfort' &&
    row.legacyDayCents === 24000 &&
    row.revisedDayCents === 22000));
  assert.ok(report.routeDifferences.every((row, i, arr) =>
    i === 0 || arr[i - 1]!.routeId.localeCompare(row.routeId) <= 0));
});

test('relatório não trata comparação estática como tarifa publicada no PostgreSQL', () => {
  const text = formatV5ReadinessMarkdown(auditV5Readiness());
  assert.match(text, /R\$ 240,00/);
  assert.match(text, /R\$ 220,00/);
  assert.match(text, /Não consulta banco PostgreSQL vigente/);
  assert.match(text, /não significa necessariamente erro/);
  assert.match(text, /Nunca alterar tarifas automaticamente/);
  assert.match(text, /26/);
});

test('relatório reflete revisão alternativa sem mudar a original', () => {
  const hypothetical = structuredClone(STATIC_PRICING_CATALOG_V1);
  const route = hypothetical.fixedRoutes.find(row => row.id === 'jeri-airport-comfort');
  assert.ok(route);
  route.dayCents = 24000;
  const result = auditV5Readiness(hypothetical);
  assert.equal(result.airportComfort.revisedDayCents, 24000);
  assert.equal(STATIC_PRICING_CATALOG_V1.fixedRoutes.find(row =>
    row.id === 'jeri-airport-comfort')?.dayCents, 22000);
});
