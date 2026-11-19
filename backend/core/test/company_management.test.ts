import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {managementTotals,validateManagementWrite,type ManagementRecord} from '../src/costs/company-management.js';
import {calculateCostReport,reportPeriod,type CostItem} from '../src/costs/company-costs.js';
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
test('quarterly fixed costs retain their anchor and confirmed expense replaces the provision once',()=>{
 const rule:CostItem={id:randomUUID(),kind:'rule',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{name:'Serviço trimestral',category:'Infraestrutura',slot:'service',notes:'',certainty:'estimated',amountCents:9000,basis:'monthly',rateBps:0,frequency:'quarterly',startsOn:'2026-01-31'}};
 const source={items:[rule],events:[],payments:[]};
 const report=calculateCostReport(source,reportPeriod('2026-01-01','2026-12-31'));
 assert.equal(report.summary.estimatedCostsCents,36000);assert.deepEqual(report.lines.map(l=>l.date).sort(),['2026-01-31','2026-04-30','2026-07-31','2026-10-31']);
 source.items.push({...rule,id:randomUUID(),kind:'expense',data:{...rule.data,occurredOn:'2026-04-30',ruleId:rule.id,certainty:'confirmed',amountCents:9500}});
 const next=calculateCostReport(source,reportPeriod('2026-01-01','2026-12-31'));
 assert.equal(next.summary.confirmedCostsCents,9500);assert.equal(next.summary.estimatedCostsCents,27000);assert.equal(next.summary.manualObligationsCents,36500);
});
