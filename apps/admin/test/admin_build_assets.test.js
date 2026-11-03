import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('ADM image includes every stylesheet requested by its entrypoint', async () => {
  const [html, dockerfile] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../Dockerfile', import.meta.url), 'utf8'),
  ]);
  const rootCopies = [...dockerfile.matchAll(/^COPY (.+) \/srv\/admin\/$/gm)]
    .flatMap(match => match[1].split(/\s+/));
  for (const [, path] of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    assert.ok(rootCopies.includes(path), `${path} must be included in the ADM image`);
    assert.ok((await readFile(new URL('../' + path, import.meta.url))).length > 0);
  }
});
