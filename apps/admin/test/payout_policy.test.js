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
