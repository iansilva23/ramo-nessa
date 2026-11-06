import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresSavedCardRepository} from '../src/payments/saved-card-repository.js';
const databaseUrl = process.env.DATABASE_URL?.trim();
test('PostgreSQL: saved cards persist masked metadata and cannot cross passenger accounts', {skip:!databaseUrl}, async () => {
  const pool = createPostgresPool(databaseUrl!);
  const a = randomUUID(), b = randomUUID();
  const repo = new PostgresSavedCardRepository(pool);
  try {
    await repo.bindCustomer(a,'test',`customer-${a}`);
    await repo.save(a,'test',{id:'card-a',lastFourDigits:'1234',paymentMethodId:'visa',paymentMethodType:'credit_card'});
    assert.equal((await new PostgresSavedCardRepository(pool).list(a,'test'))[0]?.lastFourDigits,'1234');
    assert.deepEqual(await repo.list(b,'test'),[]);
    await assert.rejects(repo.bindCustomer(b,'test',`customer-${a}`));
    await repo.remove(b,'test','card-a');
    assert.equal((await repo.list(a,'test')).length,1);
    await repo.remove(a,'test','card-a');
    assert.deepEqual(await repo.list(a,'test'),[]);
  } finally {
    await pool.query('DELETE FROM passenger_payment_customers WHERE passenger_id IN ($1,$2)',[a,b]);
    await pool.end();
  }
});
