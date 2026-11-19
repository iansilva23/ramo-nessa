import assert from 'node:assert/strict';
import { createAdminApi, AdminApiError } from '../../apps/admin/src/api.js';

// CI-only contract: the actual Admin API client talks to a local disposable
// Core server; no external API, VPS, or production data is used.
const endpoint = process.env.RAMO_V5_LOCAL_CORE_URL;
const token = process.env.RAMO_V5_READ_TOKEN;
const versionId = process.env.RAMO_V5_DRAFT_ID;
const localityId = process.env.RAMO_V5_LOCALITY_ID;
if (!endpoint || !token || !versionId || !localityId ||
    new URL(endpoint).hostname !== '127.0.0.1' ||
    new URL(endpoint).port !== '18765' ||
    process.env.RAMO_V5_EPHEMERAL_PG !== 'true') {
  throw new Error('Refusing Admin API contract test outside disposable localhost Core.');
}

const api = createAdminApi((relative, options) =>
  fetch(new URL(relative, endpoint), options),
);

const versions = await api.pricingVersions(token);
assert.ok(Array.isArray(versions.items));
assert.ok(versions.items.some((item) => item.id === versionId));

const loaded = await api.getPricingVersion(token, versionId);
assert.equal(loaded.version.id, versionId);
assert.equal(loaded.version.status, 'draft');
assert.equal(loaded.catalog.localityDisplayNames.prea[localityId], 'CI API TESTE');
assert.equal(
  loaded.catalog.localities.prea.find((item) => item.localityId === localityId)
    ?.prices.moto.amountCents,
  1200,
);

const effective = await api.pricingCatalog(token);
assert.equal(effective.authority, 'core');

const mustDeny = async (description, run) => {
  await assert.rejects(
    run,
    (error) => error instanceof AdminApiError &&
      error.status === 403 && error.code === 'ADMIN_SCOPE_REQUIRED',
    description,
  );
};
await mustDeny('create draft', () => api.createPricingVersion(token));
await mustDeny('update draft', () => api.updatePricingVersion(token, {
  versionId,
  patch: { kind: 'locality_label', scope: 'prea', localityId, label: 'NOT ALLOWED' },
  expectedUpdatedAt: loaded.version.updatedAt,
}));
await mustDeny('publish draft', () => api.publishPricingVersion(token, {
  versionId, expectedUpdatedAt: loaded.version.updatedAt,
}));
console.log('Admin API client/Core HTTP contract: read allowed; write denied.');
