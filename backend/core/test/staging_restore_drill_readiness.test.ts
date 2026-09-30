import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('staging restore drill waits for the final PostgreSQL process', async () => {
  const script = await readFile(
    resolve(process.cwd(), '../../deploy/staging/restore-drill.mjs'),
    'utf8',
  );

  assert.match(
    script,
    /cat \/proc\/1\/comm[\s\S]*?postgres[\s\S]*?pg_isready[\s\S]*?SELECT 1/,
  );
});
