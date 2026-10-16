import assert from 'node:assert/strict';
import test from 'node:test';

import {
  errorFields,
  resolveRequestId,
} from '../src/observability/logger.js';

test('request id externo só é aceito em formato seguro', () => {
  assert.equal(
    resolveRequestId('client-request_1234'),
    'client-request_1234',
  );

  const generated = resolveRequestId('invalido com espaco');
  assert.match(
    generated,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('erro estruturado limita mensagem e não serializa stack automaticamente', () => {
  const fields = errorFields(new Error('x'.repeat(800)));
  assert.equal(fields.errorName, 'Error');
  assert.equal(fields.errorMessage.length, 500);
  assert.equal('stack' in fields, false);
});
