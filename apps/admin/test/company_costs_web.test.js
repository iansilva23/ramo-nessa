import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createAdminApi} from '../src/api.js';
import {moneyToCents,reportCards} from '../src/company-costs-admin.js';
test('custos usam centavos com vírgula e ponto, sem aceitar separadores ambíguos',()=>{
  assert.equal(moneyToCents('0,99'),99);assert.equal(moneyToCents('50.01'),5001);assert.equal(moneyToCents('10'),1000);
  for(const value of ['1,999','1.000,00','-2','NaN','1e3',''])assert.throws(()=>moneyToCents(value));
});
test('cartões mostram líquido negativo e separam estimativas da confirmação',()=>{
  const cards=reportCards({commissionCents:500,otherRevenueCents:0,feeRecoveryCents:0,confirmedCostsCents:1000,estimatedCostsCents:99,resultConfirmedCents:-500,projectedNetCents:-599});
  assert.equal(cards.at(-1)[1],-599);assert.match(cards.at(-1)[0],/estimativas/);
});
test('consulta e gravação de custos usam Bearer, revisão e idempotência sem credenciais na URL',async()=>{
  const calls=[],token='secret';const api=createAdminApi(async(url,options)=>{calls.push({url,options});return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({})};});
  await api.costs(token,{from:'2026-10-01',to:'2026-10-06'});await api.saveCost(token,{id:'id',kind:'expense',data:{amountCents:99}});
  await api.saveCost(token,{id:'id',kind:'expense',data:{amountCents:120},expectedUpdatedAt:'2026-10-06T00:00:00Z'});
  assert.equal(calls[0].url,'/v1/admin/costs?from=2026-10-01&to=2026-10-06');assert.equal(calls[1].options.method,'POST');assert.equal(calls[2].options.method,'PUT');
  assert.equal(JSON.parse(calls[2].options.body).expectedUpdatedAt,'2026-10-06T00:00:00Z');
  for(const c of calls){assert.equal(c.url.includes(token),false);assert.equal(c.options.headers.authorization,'Bearer secret');}
});
test('nova página está no menu próprio e não dentro de financeiro; renderização segura e permissões próprias',()=>{
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8'),page=readFileSync(new URL('../pages/costs.html',import.meta.url),'utf8'),controller=readFileSync(new URL('../src/company-costs-admin.js',import.meta.url),'utf8');
  assert.match(index,/href="\/admin\/custos-resultado" data-view="costs"/);assert.match(page,/view-costs/);assert.doesNotMatch(controller,/innerHTML|insertAdjacentHTML/);
  assert.match(controller,/costs:write/);assert.match(controller,/costs:read/);assert.match(controller,/expectedUpdatedAt/);
});
