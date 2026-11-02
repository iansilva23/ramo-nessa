import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {newWebhookExercise,validateExercise,validateSandboxRegistration,webhookEvidence,transferEvents,webhookUrl} from './asaas-webhook-exercise-contract.mjs';
const token='private-fixture-token-12345678901234567890123456789';
const registration=()=>({id:randomUUID(),url:webhookUrl,enabled:true,interrupted:false,apiVersion:3,sendType:'SEQUENTIALLY',events:[...transferEvents],authToken:token});
test('preflight requires the exact enabled Sandbox URL, seven transfer events, v3, ordered delivery and matching token',()=>{
 const good=registration();assert.equal(validateSandboxRegistration([good],token),good.id);
 for(const [key,value] of [['url','https://other.invalid'],['enabled',false],['interrupted',true],['apiVersion',2],['sendType','NON_SEQUENTIALLY'],['authToken','different-token']])assert.throws(()=>validateSandboxRegistration([{...good,[key]:value}],token));
 assert.throws(()=>validateSandboxRegistration([good,good],token));assert.throws(()=>validateSandboxRegistration([{...good,events:transferEvents.slice(1)}],token));
 assert.throws(()=>validateSandboxRegistration([{...good,events:[...transferEvents,'PAYMENT_CREATED']}],token));
});
test('new exercise has independent identifiers; existing original cannot become new session',()=>{
 const original=randomUUID(),s=newWebhookExercise(original);validateExercise(s,original);assert.notEqual(s.id,original);
 assert.throws(()=>validateExercise({...s,id:original},original));assert.throws(()=>validateExercise(s,randomUUID()));
 assert.throws(()=>validateExercise({...s,paymentId:'not-a-uuid'},original));
});
test('only matching nonlocal completion, canonical paid status, one ledger entry and one POST can pass',()=>{
 const transferId=randomUUID(),result={transport:'asaas-sandbox-api',transferId,postAttempts:1};
 const receipt={transferId,event:'TRANSFER_DONE',localProbe:false};
 assert.equal(webhookEvidence(result,[receipt],'paid',1).externalWebhookDeliveryVerified,true);
 for(const receipts of [[],[{...receipt,localProbe:true}],[{...receipt,transferId:randomUUID()}],[{...receipt,event:'TRANSFER_CREATED'}]])assert.equal(webhookEvidence(result,receipts,'paid',1).externalWebhookDeliveryVerified,false);
 for(const [status,ledger] of [['processing',0],['paid',0],['paid',2]])assert.equal(webhookEvidence(result,[receipt],status,ledger).externalWebhookDeliveryVerified,false);
 assert.equal(webhookEvidence({...result,postAttempts:2},[receipt],'paid',1).externalWebhookDeliveryVerified,false);
 assert.equal(webhookEvidence({...result,transport:'ci-fixture'},[receipt],'paid',1).externalWebhookDeliveryVerified,false);
});
