import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {managementTotals,validateManagementWrite,type ManagementRecord} from '../src/costs/company-management.js';
const record=(kind:ManagementRecord['kind'],amountCents:number,referenceId:string|null=null):ManagementRecord=>({id:randomUUID(),kind,amountCents,referenceId,occurredOn:'2026-10-01',description:'Teste de controle',attachment:null,actor:{kind:'user',id:'test',name:'Test'} as ManagementRecord['actor'],createdAt:new Date().toISOString()});
test('returns are limited to the original withdrawal; correction preserves audit trail',()=>{
 const withdrawal=record('withdrawal',1000),returned=record('return',400,withdrawal.id);
 validateManagementWrite([withdrawal],returned);
 assert.throws(()=>validateManagementWrite([withdrawal,returned],record('return',601,withdrawal.id)),/maior/);
 assert.throws(()=>validateManagementWrite([withdrawal,returned],record('reversal',1000,withdrawal.id)),/devoluções/);
 const correction=record('reversal',400,returned.id);validateManagementWrite([withdrawal,returned],correction);
 assert.deepEqual(managementTotals([withdrawal,returned,correction]),{withdrawalsCents:1000,returnsCents:0,contributionsCents:0,lastBank:null});
});
test('reviewed months require justified reopening; duplicate corrections are refused',()=>{
 const withdrawal=record('withdrawal',1000),closed=record('close',0);
 assert.throws(()=>validateManagementWrite([withdrawal,closed],record('withdrawal',100)),/revisado/);
 const reopened=record('reopen',0);validateManagementWrite([withdrawal,closed],reopened);
 validateManagementWrite([withdrawal,closed,reopened],record('withdrawal',100));
 const correction=record('reversal',1000,withdrawal.id);
 assert.throws(()=>validateManagementWrite([withdrawal,correction],record('reversal',1000,withdrawal.id)),/indisponível/);
});
