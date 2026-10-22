import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyProductionAccount,productionCorePlan,assertProductionCoreDelta,summarizeProductionInventory} from './mp-production-preflight-contract.mjs';
const credentials={accessToken:'APP_USR-fixture-private',webhookSecret:'fixture-webhook-1234567890'};
const baseline={name:'ramo-nessa-staging',services:{core:{image:'sha256:fixture',environment:{NODE_ENV:'staging',MERCADO_PAGO_MODE:'test',MERCADO_PAGO_PIX_TEST_APPROVAL:'true',MERCADO_PAGO_ACCESS_TOKEN_TEST:'TEST-fixture-old',MERCADO_PAGO_WEBHOOK_SECRET:'old-fixture',ASAAS_PAYOUTS_ENABLED:'false',ASAAS_PAYOUT_MODE:'production',GOOGLE_MAPS_SERVER_API_KEY:'fixture-$$literal'},volumes:[{source:'docs',target:'/data'}]}},volumes:{docs:{external:true}}};
test('account verification sends only a GET to fixed HTTPS origin with redirect and timeout protections',async()=>{
  const result=await verifyProductionAccount(credentials.accessToken,async(url,options)=>{
    assert.equal(url,'https://api.mercadopago.com/users/me');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+credentials.accessToken);assert.ok(options.signal);assert.equal(options.body,undefined);
    return {ok:true,json:async()=>({id:123,site_id:'MLB',tags:['normal'],email:'private@example.test'})};
  });
  assert.deepEqual(result,{accountId:'123',siteId:'MLB',productionAccount:true});assert.ok(!JSON.stringify(result).includes('private@example'));
});
test('rejects invalid token, test account, wrong country, malformed response and network failure without echoing responses',async()=>{
  for(const body of [{id:123,site_id:'MLB',tags:['test_user']},{id:123,site_id:'MLB',tags:[],email:'anything@testuser.com'},{id:123,site_id:'MLA',tags:[]},{id:123,site_id:'MLB'},{id:'123',site_id:'MLB',tags:[]}])await assert.rejects(()=>verifyProductionAccount(credentials.accessToken,async()=>({ok:true,json:async()=>body})),/^Error: MP_/);
  await assert.rejects(()=>verifyProductionAccount(credentials.accessToken,async()=>({ok:false,status:401,json:async()=>{throw Error('should not read');}})),/MP_ACCOUNT_HTTP_401/);
  await assert.rejects(()=>verifyProductionAccount(credentials.accessToken,async()=>{throw Error('private-response-'+credentials.accessToken);}),/^Error: MP_CONNECTION_FAILED$/);
});
test('candidate replaces only Mercado Pago settings, removes test token and disables simulated Pix',()=>{
  const before=structuredClone(baseline),after=productionCorePlan(before,credentials);
  assert.deepEqual(before,baseline);assertProductionCoreDelta(before,after,credentials);
  const e=after.services.core.environment;assert.equal(e.MERCADO_PAGO_MODE,'production');assert.equal(e.MERCADO_PAGO_PIX_TEST_APPROVAL,'false');assert.equal(e.MERCADO_PAGO_ACCESS_TOKEN,credentials.accessToken);assert.equal(e.MERCADO_PAGO_ACCESS_TOKEN_TEST,undefined);
  assert.equal(e.ASAAS_PAYOUTS_ENABLED,'false');assert.equal(e.GOOGLE_MAPS_SERVER_API_KEY,'fixture-$$literal');
  for(const mutate of [p=>p.services.core.environment.ASAAS_PAYOUTS_ENABLED='true',p=>p.services.core.image='different',p=>p.services.core.volumes=[],p=>p.services.core.environment.MERCADO_PAGO_PIX_TEST_APPROVAL='true']){const bad=structuredClone(after);mutate(bad);assert.throws(()=>assertProductionCoreDelta(before,bad,credentials));}
  for(const mutate of [p=>p.services.core.environment.MERCADO_PAGO_MODE='production',p=>p.services.core.environment.ASAAS_PAYOUTS_ENABLED='true']){const bad=structuredClone(before);mutate(bad);assert.throws(()=>productionCorePlan(bad,credentials));}
});
test('summary shows monetary cents and states but never passenger, driver or ride identifiers',()=>{
  const result=summarizeProductionInventory({payments:[{status:'created',amount_cents:737}],rides:[{state:'COMPLETED'}],ledger_entries:[
    {account_key:'passenger:private-passenger:wallet',amount_cents:16400,direction:'credit'},
    {account_key:'passenger:private-passenger:wallet',amount_cents:700,direction:'debit'},
    {account_key:'driver:private-driver:payable',amount_cents:20,direction:'credit'},
    {account_key:'ride:private-ride:escrow',amount_cents:40,direction:'credit'},
    {account_key:'private-unknown',amount_cents:10,direction:'debit'}]});
  assert.deepEqual(result.nonzeroLedgerAccounts['passenger:wallet'],{accounts:1,totalCents:15700});
  assert.equal(result.payments.created.totalCents,737);assert.equal(result.rides.COMPLETED.quantity,1);assert.ok(!JSON.stringify(result).includes('private-'));
  assert.throws(()=>summarizeProductionInventory({ledger_entries:[{account_key:'x',amount_cents:1.5,direction:'credit'}]}));
});
