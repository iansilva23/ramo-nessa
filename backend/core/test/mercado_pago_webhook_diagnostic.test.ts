import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { diagnoseMercadoPagoCandidateSignature } from '../src/payments/mercado-pago-webhook-diagnostic.js';

const secret = 'diagnostic-test-key-123456';
const dataId = 'ORDTST123ABC';
const xRequestId = 'request-test';
const ts = '1791338000';
const sign = (id: string) => 'ts=' + ts + ',v1=' + createHmac('sha256', secret)
  .update(`id:${id};request-id:${xRequestId};ts:${ts};`).digest('hex');

test('diagnóstico compara chave candidata sem retornar chave ou assinatura', async () => {
  const result = await diagnoseMercadoPagoCandidateSignature({
    mode: 'test', dataId, xRequestId, xSignature: sign(dataId),
  }, async () => secret);
  assert.deepEqual(result, { candidateKeyLoaded: true,
    candidateSignatureValid: true, candidateLowerCaseSignatureValid: false });
});

test('diagnóstico identifica somente a assinatura normalizada quando corresponde', async () => {
  const result = await diagnoseMercadoPagoCandidateSignature({
    mode: 'test', dataId, xRequestId, xSignature: sign(dataId.toLowerCase()),
  }, async () => secret);
  assert.equal(result.candidateSignatureValid, false);
  assert.equal(result.candidateLowerCaseSignatureValid, true);
});

test('produção e modo ausente não leem chave candidata', async () => {
  for (const mode of ['production', undefined]) {
    const result = await diagnoseMercadoPagoCandidateSignature({
      mode, dataId, xRequestId, xSignature: sign(dataId),
    }, async () => { assert.fail('leitura fora de teste'); });
    assert.equal(result.candidateKeyLoaded, false);
  }
});

test('chave ausente ou malformada não interrompe a rejeição', async () => {
  for (const read of [async () => { throw new Error('missing'); }, async () => 'bad']) {
    const result = await diagnoseMercadoPagoCandidateSignature({
      mode: 'test', dataId, xRequestId, xSignature: sign(dataId),
    }, read);
    assert.equal(result.candidateKeyLoaded, false);
    assert.equal(result.candidateSignatureValid, false);
  }
});
