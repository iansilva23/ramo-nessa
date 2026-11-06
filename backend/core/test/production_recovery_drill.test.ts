import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL(
  '../../../deploy/prod/restore-drill.mjs',
  import.meta.url,
);

test('restore drill permanece isolado dos recursos de produção', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.match(script, /verify-backup\.mjs/);
  assert.equal(
    (script.match(/'--network',\s*'none'/g) ?? []).length >= 3,
    true,
  );
  assert.match(script, /'volume',\s*'create'/);
  assert.match(script, /'volume',\s*'rm',\s*'-f'/);
  assert.match(script, /finally\s*\{/);
  assert.match(script, /pg_restore/);
  assert.match(script, /--exit-on-error/);
  assert.match(script, /driverDocuments/);

  for (const forbidden of [
    'docker compose down',
    'ramo-nessa-prod_driver_documents',
    'ramo-nessa-prod_postgres_data',
    'postgres_data:/',
    'driver_documents:/',
  ]) {
    assert.equal(
      script.includes(forbidden),
      false,
      'restore drill não pode referenciar recurso produtivo: ' + forbidden,
    );
  }
});

test('restore drill não abre rede nem imprime inventário de documentos', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.equal(script.includes("'--network',\n    'host'"), false);
  assert.equal(script.includes("'--network',\n    'bridge'"), false);
  assert.equal(script.includes('console.log(documentsName)'), false);
  assert.equal(script.includes('console.log(databaseName)'), false);
  assert.match(
    script,
    /Nenhum volume, banco ou container de produção foi alterado/,
  );
});
