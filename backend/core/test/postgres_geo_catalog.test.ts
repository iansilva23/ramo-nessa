import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import {
  PostgresGeoCatalogRepository,
} from '../src/places/geo-catalog-repository.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

test('PostgreSQL GeoDB: importação idempotente, revisão e busca sem acentos', {
  skip: !databaseUrl,
}, async () => {
  const pool = createPostgresPool(databaseUrl!);
  const repo = new PostgresGeoCatalogRepository(pool);
  const sourceId = 'node/' + randomUUID();
  const record = {
    source: 'osm' as const, sourceId,
    name: 'Pousada da Lagoa', address: 'Rua do Céu, Preá, Ceará',
    category: 'hospedagem', city: 'Cruz',
    latitude: -2.82017, longitude: -40.41467,
  };
  const id = 'geo:osm:' + sourceId;
  try {
    assert.deepEqual((await repo.preview([record])).map(x => x.kind), ['new']);
    assert.deepEqual(await repo.apply([record]), { added: 1, changed: 0, unchanged: 0 });
    assert.deepEqual(await repo.apply([record]), { added: 0, changed: 0, unchanged: 1 });
    assert.equal((await repo.search('ceu', true)).some(x => x.id === id), true);
    assert.equal((await repo.search('pousada', true)).some(x => x.id === id), true);
    assert.equal((await repo.findById(id))?.address, record.address);

    const changed = { ...record, name: 'Pousada da Lagoa Renovada' };
    assert.deepEqual((await repo.preview([changed])).map(x => x.kind), ['changed']);
    assert.deepEqual(await repo.apply([changed]), { added: 0, changed: 1, unchanged: 0 });
    assert.equal((await repo.findById(id))?.name, changed.name);
  } finally {
    await pool.query('DELETE FROM geo_catalog_places WHERE id=$1', [id]);
    await pool.end();
  }
});
