import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('staging backup reads protected driver documents as the app uid', async () => {
  const script = await readFile(
    resolve(process.cwd(), '../../deploy/staging/backup.mjs'),
    'utf8',
  );

  assert.match(
    script,
    /'--read-only',[\s\S]*?'--user',[\s\S]*?'1000:1000',[\s\S]*?documentVolume \+ ':\/source:ro'/,
  );
});
