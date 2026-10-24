import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  HttpRequestBodyError,
  readJsonBody,
} from '../src/http/request-body.js';

function requestFrom(
  chunks: Array<string | Buffer>,
  headers: Record<string, string> = {},
): IncomingMessage {
  const stream = Readable.from(chunks) as IncomingMessage;
  Object.assign(stream, { headers });
  return stream;
}

test('leitor JSON aceita corpo válido e vazio', async () => {
  assert.deepEqual(
    await readJsonBody(requestFrom(['{"ok":true}'])),
    { ok: true },
  );
  assert.deepEqual(await readJsonBody(requestFrom([])), {});
});

test('leitor JSON rejeita content-length acima do limite', async () => {
  await assert.rejects(
    () =>
      readJsonBody(
        requestFrom([], { 'content-length': '100' }),
        16,
      ),
    (error: unknown) =>
      error instanceof HttpRequestBodyError &&
      error.code === 'PAYLOAD_TOO_LARGE',
  );
});

test('leitor JSON interrompe stream que ultrapassa o limite real', async () => {
  await assert.rejects(
    () => readJsonBody(requestFrom(['12345678', '90123456', '7']), 16),
    (error: unknown) =>
      error instanceof HttpRequestBodyError &&
      error.code === 'PAYLOAD_TOO_LARGE',
  );
});
