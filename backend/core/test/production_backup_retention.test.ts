import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const scriptPath = new URL(
  '../../../deploy/prod/backup-retention.mjs',
  import.meta.url,
);

const snapshots = Array.from(
  { length: 8 },
  (_, index) =>
    '2026-09-' +
    String(index + 1).padStart(2, '0') +
    'T00-00-00-000Z',
);

async function createSnapshot(root: string, name: string) {
  const path = resolve(root, name);
  await mkdir(path, { recursive: false });
  await writeFile(
    resolve(path, 'manifest.json'),
    JSON.stringify({
      version: 1,
      project: 'ramo-nessa-prod',
      containsSecrets: false,
      database: { name: 'database.dump' },
      driverDocuments: { name: 'driver-documents.tar.gz' },
    }),
    'utf8',
  );
}

function runRetention(root: string, apply: boolean) {
  return spawnSync(
    process.execPath,
    [
      scriptPath.pathname,
      '--backup-dir=' + root,
      '--keep=7',
      '--apply=' + String(apply),
    ],
    { encoding: 'utf8' },
  );
}

test('retenção faz dry-run por padrão e remove somente snapshot reconhecido quando aplicada', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ramo-retention-'));

  try {
    for (const snapshot of snapshots) {
      await createSnapshot(root, snapshot);
    }

    const incomplete =
      '2026-09-09T00-00-00-000Z.incomplete';
    await mkdir(resolve(root, incomplete));

    const unrelated = 'manual-notes';
    await mkdir(resolve(root, unrelated));

    const suspicious =
      '2026-09-10T00-00-00-000Z';
    await mkdir(resolve(root, suspicious));
    await writeFile(
      resolve(root, suspicious, 'manifest.json'),
      JSON.stringify({
        version: 99,
        project: 'outro-projeto',
        containsSecrets: false,
      }),
      'utf8',
    );

    const dryRun = runRetention(root, false);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /"mode":"dry-run"/);
    assert.match(
      dryRun.stdout,
      /Dry-run: nenhum backup foi removido/,
    );

    let names = await readdir(root);
    assert.equal(names.includes(snapshots[0]!), true);
    assert.equal(names.includes(incomplete), true);
    assert.equal(names.includes(unrelated), true);
    assert.equal(names.includes(suspicious), true);

    const apply = runRetention(root, true);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /"mode":"apply"/);
    assert.match(
      apply.stdout,
      /Snapshot local removido pela retenção/,
    );

    names = await readdir(root);
    assert.equal(names.includes(snapshots[0]!), false);
    for (const snapshot of snapshots.slice(1)) {
      assert.equal(names.includes(snapshot), true);
    }
    assert.equal(names.includes(incomplete), true);
    assert.equal(names.includes(unrelated), true);
    assert.equal(names.includes(suspicious), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('retenção recusa política agressiva com menos de sete snapshots', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ramo-retention-min-'));

  try {
    const result = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        '--backup-dir=' + root,
        '--keep=1',
        '--apply=true',
      ],
      { encoding: 'utf8' },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /--keep deve ser um inteiro entre 7 e 365/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
