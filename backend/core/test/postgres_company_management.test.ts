import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresManagementStore,type ManagementRecord} from '../src/costs/company-management.js';
test('Postgres management records persist, retry once, preserve audit and serialize concurrent returns',{skip:process.env.RAMO_COMPANY_MANAGEMENT_POSTGRES!=='true'},async()=>{
 const p=createPostgresPool(process.env.DATABASE_URL!),store=new PostgresManagementStore(p);const ids:string[]=[];
 const row=(kind:ManagementRecord['kind'],amountCents:number,referenceId:string|null=null):ManagementRecord=>{const id=randomUUID();ids.push(id);return {id,kind,amountCents,referenceId,occurredOn:'2026-10-03',description:'Synthetic management test',attachment:null,actor:{kind:'user',id:'test',name:'Test'} as ManagementRecord['actor'],createdAt:new Date().toISOString()};};
 try{const withdrawal=row('withdrawal',1000);withdrawal.attachment={name:'receipt.pdf',contentType:'application/pdf',base64:Buffer.from('%PDF-1.4 fixture').toString('base64')};await store.save(withdrawal);await store.save(withdrawal);assert.equal((await store.list()).filter(r=>r.id===withdrawal.id).length,1);
 const results=await Promise.allSettled([store.save(row('return',700,withdrawal.id)),store.save(row('return',700,withdrawal.id))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await store.list()).filter(r=>r.referenceId===withdrawal.id).reduce((s,r)=>s+r.amountCents,0),700);
 }finally{await p.query('DELETE FROM company_management_records WHERE reference_id=ANY($1::uuid[])',[ids]);await p.query('DELETE FROM company_management_records WHERE id=ANY($1::uuid[])',[ids]);await p.end();}
});
