import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AsaasDriverPayoutProvider } from "../src/payments/asaas-driver-payout-provider.js";
import {
  InMemoryAsaasPayoutStore,
  type AsaasPayoutStore,
} from "../src/payments/asaas-payout-store.js";
import { InMemoryFinanceRepository } from "../src/payments/repositories/in-memory-finance-repository.js";
import type { FinanceRepository } from "../src/payments/finance-repository.js";
import { createManualDriverPayouts } from "../src/payments/driver-payout-policy-service.js";
import {
  applyConfirmedDriverPayoutResult,
  processDriverPayout,
} from "../src/payments/driver-payout-processing-service.js";
import { createDriverPayoutProviderFromEnv } from "../src/payments/driver-payout-provider.js";
import {
  requestDriverPayoutFromApp,
  driverFinanceSummary,
} from "../src/drivers/driver-finance-service.js";
import { updateAdminPayoutAutomaticMode } from "../src/admin/admin-payout-service.js";
import { InMemoryAdminRepository } from "../src/admin/repositories/in-memory-admin-repository.js";

import { fixture, fundedFinance } from "./helpers/asaas-fixture.js";

const process = (
  f: Awaited<ReturnType<typeof fixture>>,
  provider = f.provider,
) =>
  processDriverPayout({ finance: f.finance, provider, payoutId: f.payout.id });

test("Asaas: concurrent sends post once; authenticated canonical webhook settles ledger once", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([1, 2, 3].map(() => process(f)));
  assert.ok(results.some((r) => r.status === "fulfilled"));
  assert.equal(f.counts().posts, 1);
  assert.equal(
    (await f.finance.findDriverPayoutById(f.payout.id))?.status,
    "processing",
  );
  assert.equal(
    await f.finance.getAccountBalanceCents(
      `driver:${f.driverId}:payout_pending`,
    ),
    20000,
  );
  await assert.rejects(f.finance.cancelDriverPayout({ payoutId: f.payout.id }));
  const raw = {
    id: "evt-" + randomUUID(),
    event: "TRANSFER_FAILED",
    transfer: { id: f.transfer.id, status: "FAILED", value: 1 },
  };
  await assert.rejects(f.provider.receiveWebhook("wrong", raw));
  f.state("DONE");
  const r = await f.provider.receiveWebhook(f.options.webhookToken, raw);
  assert.equal(r.result?.status, "paid");
  await applyConfirmedDriverPayoutResult({
    finance: f.finance,
    provider: f.provider,
    payoutId: r.payoutId!,
    result: r.result!,
  });
  await f.provider.completeWebhook(raw.id);
  assert.deepEqual(
    await f.provider.receiveWebhook(f.options.webhookToken, raw),
    { duplicate: true },
  );
  await process(f);
  assert.equal(f.counts().posts, 1);
  assert.equal(
    await f.finance.getAccountBalanceCents(
      `driver:${f.driverId}:payout_pending`,
    ),
    0,
  );
  const events = await f.finance.listLedgerTransactionsForAccounts(
    [`driver:${f.driverId}:payout_pending`],
    50,
  );
  assert.equal(
    events.filter((e) => e.referenceKey === `driver-payout-paid:${f.payout.id}`)
      .length,
    1,
  );
});
test("Asaas: lost response recovers across provider restart by exact reference without a second POST", async () => {
  const f = await fixture();
  f.behavior("timeout-found");
  await assert.rejects(process(f));
  f.state("DONE");
  assert.equal(
    (await process(f, new AsaasDriverPayoutProvider(f.options))).kind,
    "paid",
  );
  assert.equal(f.counts().posts, 1);
  assert.equal((await f.store.get(f.payout.id))?.transferId, f.transfer.id);
});
test("Asaas: uncertain missing transfer keeps reservation and cannot be cancelled or resent", async () => {
  const f = await fixture();
  f.behavior("timeout-missing");
  await assert.rejects(process(f));
  for (let i = 0; i < 2; i++)
    await process(f, new AsaasDriverPayoutProvider(f.options));
  assert.equal(f.counts().posts, 1);
  assert.equal(
    await f.finance.getAccountBalanceCents(
      `driver:${f.driverId}:payout_pending`,
    ),
    20000,
  );
  await assert.rejects(f.finance.cancelDriverPayout({ payoutId: f.payout.id }));
});
test("Asaas: definitive rejection refunds once; normal manual payouts never call the API", async () => {
  const f = await fixture();
  f.behavior("rejected");
  assert.equal((await process(f)).kind, "failed");
  await process(f);
  assert.equal(
    await f.finance.getAccountBalanceCents(`driver:${f.driverId}:payable`),
    20000,
  );
  assert.equal(f.counts().posts, 1);
  const b = await createManualDriverPayouts({
    finance: f.finance,
    driverIds: [f.driverId],
    batchId: randomUUID(),
    executionMode: "manual",
  });
  await assert.rejects(
    processDriverPayout({
      finance: f.finance,
      provider: f.provider,
      payoutId: b.created[0]!.id,
    }),
  );
  assert.equal(f.counts().posts, 1);
});
test("Asaas: mismatched amounts and BLOCKED are never marked paid", async () => {
  const f = await fixture();
  f.behavior("mismatch");
  await assert.rejects(process(f));
  f.behavior("normal");
  f.state("BLOCKED");
  assert.equal((await process(f)).kind, "processing");
  assert.equal(f.counts().posts, 1);
  assert.equal(
    await f.finance.getAccountBalanceCents(
      `driver:${f.driverId}:payout_pending`,
    ),
    20000,
  );
});
test("Asaas: approval/key alone do not arm transfers; durable store and cutover are mandatory", async () => {
  const f = await fixture();
  assert.equal(
    createDriverPayoutProviderFromEnv({
      DRIVER_PAYOUT_PROVIDER_NAME: "asaas",
      ASAAS_API_KEY: f.options.apiKey,
    }),
    null,
  );
  assert.throws(() =>
    createDriverPayoutProviderFromEnv(
      {
        DRIVER_PAYOUT_PROVIDER_NAME: "asaas",
        ASAAS_PAYOUTS_ENABLED: "true",
        ASAAS_PAYOUT_MODE: "production",
        ASAAS_PAYOUT_START_AFTER: f.options.startAfter,
        ASAAS_API_KEY: f.options.apiKey,
        ASAAS_WEBHOOK_TOKEN: f.options.webhookToken,
      },
      { store: f.store, financeLookup: f.options.financeLookup },
    ),
  );
  await assert.rejects(
    process(
      f,
      new AsaasDriverPayoutProvider({
        ...f.options,
        startAfter: "2099-01-01T00:00:00Z",
      }),
    ),
  );
  assert.equal(f.counts().posts, 0);
});
test("anticipation: quoted owner terms, manual execution and immutable fees across retries", async () => {
  const { finance, driverId } = await fundedFinance(),
    admin = new InMemoryAdminRepository(),
    actor = { kind: "user" as const, id: randomUUID(), name: "Fixture Owner" };
  await updateAdminPayoutAutomaticMode({
    finance,
    admin,
    actor,
    mode: "manual",
    automaticEnabled: false,
    anticipationMinimumCents: 5000,
    anticipationFeeCents: 500,
  });
  const summary = await driverFinanceSummary(finance, driverId);
  assert.equal(summary.anticipationMinimumCents, 5000);
  assert.equal(summary.anticipationFeeCents, 500);
  const input = {
    repository: finance,
    driverId,
    amountCents: 8000,
    idempotencyKey: randomUUID(),
  };
  await assert.rejects(requestDriverPayoutFromApp(input));
  const first = await requestDriverPayoutFromApp({
    ...input,
    expectedFeeCents: 500,
    expectedMinimumCents: 5000,
  });
  assert.equal(first.payout.executionMode, "manual");
  assert.equal(first.payout.amountCents, 7500);
  await updateAdminPayoutAutomaticMode({
    finance,
    admin,
    actor,
    mode: "manual",
    automaticEnabled: false,
    anticipationMinimumCents: 9000,
    anticipationFeeCents: 2000,
  });
  const retry = await requestDriverPayoutFromApp(input);
  assert.equal(retry.duplicateRequest, true);
  assert.equal(retry.payout.id, first.payout.id);
  assert.equal(retry.payout.feeCents, 500);
  await assert.rejects(
    updateAdminPayoutAutomaticMode({
      finance,
      admin,
      actor,
      mode: "manual",
      automaticEnabled: false,
      anticipationMinimumCents: 100,
      anticipationFeeCents: 100,
    }),
  );
});
