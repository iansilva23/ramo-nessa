import type { Pool } from 'pg';
import { PostgresPricingCatalogVersionRepository } from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { createPricingCatalogDraft, publishPricingCatalogVersion } from '../src/pricing/pricing-catalog-version-service.js';
import { createPostgresPool } from '../src/db/postgres.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { applyApprovedCommercialRevision } from '../src/pricing/approved-commercial-revision.js';
import { normalizePricingCatalogSnapshot } from '../src/pricing/catalog-snapshot.js';
import { quoteFare } from '../src/pricing/quote-engine.js';

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL é obrigatório. Execute dentro do Core.');
const pool = createPostgresPool(databaseUrl);
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-approved-pricing-20261003',0))");
  const rows = await client.query(`SELECT id, snapshot FROM pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC, version_number DESC LIMIT 1`);
  const current = rows.rows[0];
  const snapshot = applyApprovedCommercialRevision(current == null ? STATIC_PRICING_CATALOG_V1 : normalizePricingCatalogSnapshot(current.snapshot));
  const sample = quoteFare({origin:{zoneId:'prea',localityId:'prea'},destination:{zoneId:'prea',localityId:'prea'},category:'moto',period:'after_22'},snapshot);
  if (sample.kind !== 'exact' || sample.baseAmountCents !== 1660) throw new Error('Revisão comercial não passou na verificação.');
  if (current?.snapshot?.commercialPolicy?.revision === '2026-10-03') {
    console.log('Revisão já publicada. Edições posteriores do ADM foram preservadas.');
  } else if (!apply) {
    console.log('SIMULAÇÃO: revisão 2026-10-03 pronta. Nenhuma alteração foi salva. Use --apply para publicar.');
  } else {
    const userId = process.env.ADMIN_OWNER_USER_ID?.trim();
    if (!userId) throw new Error('ADMIN_OWNER_USER_ID é obrigatório para atribuir a auditoria.');
    const user = await client.query('SELECT id FROM admin_users WHERE id=$1',[userId]);
    if (user.rows.length !== 1) throw new Error('Conta proprietária não encontrada.');
    const actorName = 'Publicação comercial aprovada por Ian — 2026-10-03';
    const transactionPool = {query:client.query.bind(client)} as unknown as Pool;
    const versions = new PostgresPricingCatalogVersionRepository(transactionPool);
    const admin = new PostgresAdminRepository(transactionPool);
    const actor = {kind:'user' as const,id:userId,name:actorName};
    const draft = await createPricingCatalogDraft({versions,admin,actor,snapshot});
    const published = await publishPricingCatalogVersion({versions,admin,actor,versionId:draft.id,expectedUpdatedAt:draft.updatedAt});
    console.log(`Revisão 2026-10-03 publicada: versão #${published.versionNumber}. Histórico, áreas do mapa e corridas anteriores preservados.`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
