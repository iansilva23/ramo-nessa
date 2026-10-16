import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openInterestStore } from '../db/interests.ts';
import { interestSchema, readInterestBody, allowInterestRequest } from '../lib/interest-request.ts';

const valid = { name: 'Teste Local', phone: '(88) 99999-9999', region: 'Preá', vehicle: 'Mototáxi', consent: true, website: '', requestId: 'bfe04231-0dc7-41fb-b41f-4f8c75c29d45' };

test('original form contract normalizes phone and requires consent', () => {
  assert.equal(interestSchema.parse(valid).phone, '88999999999');
  for (const body of [{ ...valid, consent: false }, { ...valid, website: 'spam' }, { ...valid, admin: true }, { ...valid, phone: '123' }, { ...valid, region: 'Outra' }]) {
    assert.equal(interestSchema.safeParse(body).success, false);
  }
});

test('SQLite preserves records after restart and makes request IDs idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ramo-site-test-'));
  const filename = join(dir, 'interests.sqlite');
  try {
    const input = { id: valid.requestId, name: "Teste ' ; DROP TABLE driver_interests; --", phone: '88999999999', region: 'Preá', vehicle: 'Mototáxi' };
    let store = openInterestStore(filename);
    store.save(input);
    store.save(input);
    store.close();
    store = openInterestStore(filename);
    store.check();
    store.close();
    const db = new DatabaseSync(filename, { readOnly: true });
    const rows = db.prepare('SELECT * FROM driver_interests').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, input.name);
    assert.equal(rows[0].consent_version, '2026-10-02');
    db.close();
    assert.equal(statSync(filename).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bounded body reader rejects oversized UTF-8 and declared oversized content', async () => {
  assert.deepEqual(await readInterestBody(new Request('https://site.test', { method: 'POST', body: JSON.stringify(valid) })), valid);
  await assert.rejects(readInterestBody(new Request('https://site.test', { method: 'POST', body: 'é'.repeat(2100) })), RangeError);
  await assert.rejects(readInterestBody(new Request('https://site.test', { method: 'POST', headers: { 'content-length': '5000' }, body: '{}' })), RangeError);
  assert.equal(await readInterestBody(new Request('https://site.test', { method: 'POST', body: '{bad' })), null);
});

test('rate limit is isolated by address and expires', () => {
  const now = Date.now();
  for (let i = 0; i < 20; i++) assert.equal(allowInterestRequest('test-address', now), true);
  assert.equal(allowInterestRequest('test-address', now), false);
  assert.equal(allowInterestRequest('other-test-address', now), true);
  assert.equal(allowInterestRequest('test-address', now + 600001), true);
});
