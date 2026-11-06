import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
import {PostgresFinanceRepository} from '/app/dist/src/payments/repositories/postgres-finance-repository.js';
import {PostgresAsaasPayoutStore} from '/app/dist/src/payments/asaas-payout-store.js';
import {AsaasDriverPayoutProvider} from '/app/dist/src/payments/asaas-driver-payout-provider.js';
import {applyConfirmedDriverPayoutResult} from '/app/dist/src/payments/driver-payout-processing-service.js';
import {createSandboxWebhookServer} from './asaas-sandbox-webhook-http.mjs';
const dir='/audit/data',s=JSON.parse(readFileSync(dir+'/session.json','utf8'));
assert.match(s.id,/^[a-f0-9-]{36}$/);
const url=new URL(process.env.DATABASE_URL??'https://invalid');
assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'ramo-asaas-sandbox-'+s.id.replaceAll('-','')+'-db');
assert.equal(url.port,'5432');assert.equal(url.pathname,'/ramo_asaas_sandbox');
const token=readFileSync(dir+'/webhook-token','utf8').trim(),key=readFileSync('/run/secrets/asaas-sandbox-api-key','utf8').trim();
const pool=createPostgresPool(url.toString()),finance=new PostgresFinanceRepository(pool),store=new PostgresAsaasPayoutStore(pool);
const provider=new AsaasDriverPayoutProvider({environment:'sandbox',apiKey:key,webhookToken:token,
 startAfter:new Date(Date.parse(s.createdAt)-60000).toISOString(),store,financeLookup:id=>finance.findDriverPayoutById(id),
 fetcher:(input,init={})=>{
  const target=new URL(input);
  assert.equal(target.origin,'https://api-sandbox.asaas.com');assert.equal(init.method??'GET','GET');
  assert.match(target.pathname,/^\/v3\/transfers\/[a-f0-9-]{36}$/);
  return fetch(input,{...init,redirect:'error'});
 }});
const server=createSandboxWebhookServer({token,healthy:()=>pool.query('SELECT 1'),receive:(auth,body)=>provider.receiveWebhook(auth,body),
 apply:event=>applyConfirmedDriverPayoutResult({finance,provider,payoutId:event.payoutId,result:event.result}),
 complete:id=>provider.completeWebhook(id),receipt:entry=>appendFileSync(dir+'/webhook-receipts.jsonl',JSON.stringify(entry)+'\n',{mode:0o600})});
await pool.query('SELECT 1');
server.listen(8080,'0.0.0.0',()=>console.log('SANDBOX_WEBHOOK_READY'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>pool.end().then(()=>process.exit(0))));
