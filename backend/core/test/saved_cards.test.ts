import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySavedCardRepository } from '../src/payments/saved-card-repository.js';
import { MercadoPagoOrdersClient } from '../src/payments/mercado-pago-orders.js';
import { parseCreatePaymentRequest } from '../src/payments/validation.js';

test('saved card metadata is scoped to authenticated passenger and gateway credentials', async () => {
  const repo = new InMemorySavedCardRepository();
  await repo.bindCustomer('alice','test','customer-a');
  await repo.save('alice','test',{id:'card-a',lastFourDigits:'1234',paymentMethodId:'visa',paymentMethodType:'credit_card'});
  assert.equal((await repo.list('alice','test')).length,1);
  assert.deepEqual(await repo.list('bob','test'),[]);
  assert.deepEqual(await repo.list('alice','production'),[]);
  await assert.rejects(repo.bindCustomer('bob','test','customer-a'));
  await repo.remove('bob','test','card-a');
  assert.equal((await repo.list('alice','test')).length,1);
  await repo.remove('alice','test','card-a');
  assert.deepEqual(await repo.list('alice','test'),[]);
});
test('gateway saves only token, returns masked metadata and binds saved-card payment customer', async () => {
  const requests: {path:string;body:Record<string,unknown>}[] = [];
  const client = new MercadoPagoOrdersClient('APP_USR-test-key-long-enough',async(url,init) => {
    const body = JSON.parse(String(init?.body ?? '{}')); requests.push({path:url,body});
    if(url.endsWith('/v1/customers')) return Response.json({id:'customer-a'});
    if(url.endsWith('/cards')) return Response.json({id:'card-a',last_four_digits:'1234',first_six_digits:'450995',cardholder:{identification:{number:'sensitive'}},payment_method:{id:'visa',payment_type_id:'credit_card'}});
    return Response.json({id:'order-a',status:'processed',status_detail:'accredited',transactions:{payments:[{id:'payment-a',status:'processed',status_detail:'accredited'}]}});
  });
  assert.equal(await client.createCustomer('alice@example.com'),'customer-a');
  const card = await client.saveCustomerCard('customer-a','token-to-save');
  assert.deepEqual(Object.keys(card).sort(),['id','lastFourDigits','paymentMethodId','paymentMethodType']);
  assert.deepEqual(requests[1]?.body,{token:'token-to-save'});
  await client.createCardOrder({paymentId:'ride-payment',amountCents:4000,payerEmail:'alice@example.com',customerId:'customer-a',cardToken:'fresh-payment-token',paymentMethodId:'visa',paymentMethodType:'credit_card',installments:1,idempotencyKey:'same-ride'});
  assert.deepEqual(requests[2]?.body.payer,{email:'alice@example.com',customer_id:'customer-a'});
});
test('saved card input rejects path injection and preserves one installment', () => {
  const base = {method:'card',payerEmail:'a@example.com',cardToken:'a'.repeat(32),paymentMethodId:'visa',paymentMethodType:'credit_card'};
  assert.throws(() => parseCreatePaymentRequest({...base,savedCardId:'../other-customer'}));
  assert.throws(() => parseCreatePaymentRequest({...base,savedCardId:'123',installments:2}));
  assert.equal(parseCreatePaymentRequest({...base,savedCardId:'123'}).savedCardId,'123');
});
