import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasDriverPayoutProvider } from '../src/payments/asaas-driver-payout-provider.js';
import { createAsaasWebhookReceiverFromEnv, createDriverPayoutProviderFromEnv } from '../src/payments/driver-payout-provider.js';
import { fixture } from './helpers/asaas-fixture.js';
import { processDriverPayout, applyConfirmedDriverPayoutResult } from '../src/payments/driver-payout-processing-service.js';

test('receive-only adapter blocks submission before finance lookup, durable intent, or HTTP', async () => {
  const f = await fixture();
  let lookups = 0, requests = 0;
  const receiver = new AsaasDriverPayoutProvider({
    ...f.options, submissionsEnabled: false,
    financeLookup: async () => { lookups++; return f.payout; },
    fetcher: async () => { requests++; throw Error('must not call network'); },
  });
  assert.throws(() => receiver.submissionReference(f.payout), /Envios Asaas bloqueados/);
  await assert.rejects(receiver.createPixPayout({payoutId:f.payout.id,amountCents:f.payout.amountCents,pixKeyType:f.payout.pixKeyType,pixKey:f.payout.pixKey}), /Envios Asaas bloqueados/);
  await assert.rejects(processDriverPayout({finance:f.finance,provider:receiver,payoutId:f.payout.id}), /Envios Asaas bloqueados/);
  assert.equal(lookups, 0); assert.equal(requests, 0);
  assert.equal(await f.store.get(f.payout.id), null);
  assert.equal((await f.finance.findDriverPayoutById(f.payout.id))?.status, f.payout.status);
});

test('receive-only adapter authenticates, reconciles canonical completion, and replays once without posting', async () => {
  const f = await fixture();
  await processDriverPayout({finance:f.finance,provider:f.provider,payoutId:f.payout.id});
  const receiver = new AsaasDriverPayoutProvider({...f.options,submissionsEnabled:false});
  const raw={id:'receive-only-done',event:'TRANSFER_DONE',transfer:{id:f.transfer.id}};
  await assert.rejects(receiver.receiveWebhook('wrong',raw));
  f.state('DONE');
  const r=await receiver.receiveWebhook(f.options.webhookToken,raw);
  assert.equal(r.result?.status,'paid');
  await applyConfirmedDriverPayoutResult({finance:f.finance,provider:receiver,payoutId:r.payoutId!,result:r.result!});
  await receiver.completeWebhook(raw.id);
  assert.deepEqual(await receiver.receiveWebhook(f.options.webhookToken,raw),{duplicate:true});
  assert.equal(f.counts().posts,1);
  assert.equal((await f.finance.findDriverPayoutById(f.payout.id))?.status,'paid');
});

test('production webhook opt-in does not create a sender, mutate env, or accept incomplete configuration', async () => {
  const f=await fixture();
  const store=Object.create(f.store) as typeof f.store;
  Object.defineProperty(store,'durable',{value:true});
  const env={
    DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_WEBHOOK_ENABLED:'true',
    ASAAS_PAYOUTS_ENABLED:'false',ASAAS_PAYOUT_MODE:'production',
    ASAAS_PAYOUT_START_AFTER:'2099-01-01T00:00:00Z',
    ASAAS_API_KEY:f.options.apiKey,ASAAS_WEBHOOK_TOKEN:f.options.webhookToken,
  };
  const deps={store,financeLookup:f.options.financeLookup};
  const before={...env};
  assert.equal(createDriverPayoutProviderFromEnv(env,deps),null);
  const receiver=createAsaasWebhookReceiverFromEnv(env,deps);
  assert.ok(receiver instanceof AsaasDriverPayoutProvider);
  assert.equal(receiver.environment,'production');
  assert.throws(()=>receiver.submissionReference(f.payout),/Envios Asaas bloqueados/);
  assert.deepEqual(env,before);
  assert.equal(createAsaasWebhookReceiverFromEnv({...env,ASAAS_WEBHOOK_ENABLED:'false'},deps),null);
  assert.throws(()=>createAsaasWebhookReceiverFromEnv({...env,DRIVER_PAYOUT_PROVIDER_NAME:'other'},deps));
  assert.throws(()=>createAsaasWebhookReceiverFromEnv({...env,ASAAS_API_KEY:''},deps));
  assert.throws(()=>createAsaasWebhookReceiverFromEnv(env,{...deps,store:f.store}));
});
