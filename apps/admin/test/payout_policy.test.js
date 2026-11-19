import { createAdminApi } from '../src/api.js';
import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePayoutPolicyAmounts,
  asaasIntegrationMessage,
} from "../src/payout-policy.js";
test("policy values use integer cents, reject ambiguous and invalid money", () => {
  assert.deepEqual(parsePayoutPolicyAmounts("80,00", "10"), {
    anticipationMinimumCents: 8000,
    anticipationFeeCents: 1000,
  });
  assert.deepEqual(parsePayoutPolicyAmounts("0.01", "0"), {
    anticipationMinimumCents: 1,
    anticipationFeeCents: 0,
  });
  for (const [m, f] of [
    ["80", "80"],
    ["0", "0"],
    ["-80", "10"],
    ["80", "-1"],
    ["80,001", "1"],
    ["1.000,00", "1"],
    ["1000001", "1"],
    ["", "10"],
  ])
    assert.throws(() => parsePayoutPolicyAmounts(m, f));
});
test("Asaas configuration status never represents a confirmed transfer", () => {
  assert.match(
    asaasIntegrationMessage({
      status: "configured",
      apiAvailable: true,
      environment: "sandbox",
    }),
    /sandbox/,
  );
  assert.match(
    asaasIntegrationMessage({ status: "disabled", apiAvailable: false }),
    /desativada/,
  );
  assert.match(asaasIntegrationMessage(), /aguardando/);
});

test('Financeiro client sends the quoted policy fields to the existing owner-only endpoint', async () => {
 const calls=[];
 const api=createAdminApi(async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({mode:'manual'}),{status:200,headers:{'content-type':'application/json'}});});
 await api.updateFinancePayoutPolicy('fixture-admin-token',{mode:'manual',anticipationMinimumCents:5000,anticipationFeeCents:500});
 assert.equal(calls[0].url,'/v1/admin/finance/payout-policy');
 assert.equal(calls[0].init.method,'PATCH');
 assert.deepEqual(JSON.parse(calls[0].init.body),{mode:'manual',anticipationMinimumCents:5000,anticipationFeeCents:500});
 assert.equal(calls[0].init.headers.authorization,'Bearer fixture-admin-token');
 assert.equal(calls[0].url.includes('fixture-admin-token'),false);
 await api.updateFinancePayoutPolicy('fixture-admin-token',{automaticEnabled:false});
 assert.deepEqual(JSON.parse(calls[1].init.body),{automaticEnabled:false});
});
