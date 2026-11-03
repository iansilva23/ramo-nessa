import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AsaasDriverPayoutProvider } from "../../src/payments/asaas-driver-payout-provider.js";
import {
  InMemoryAsaasPayoutStore,
  type AsaasPayoutStore,
} from "../../src/payments/asaas-payout-store.js";
import { InMemoryFinanceRepository } from "../../src/payments/repositories/in-memory-finance-repository.js";
import type { FinanceRepository } from "../../src/payments/finance-repository.js";
import { createManualDriverPayouts } from "../../src/payments/driver-payout-policy-service.js";
export async function fundedFinance(
  finance: FinanceRepository = new InMemoryFinanceRepository(),
) {
  const id = randomUUID(),
    rideId = randomUUID(),
    driverId = "asaas-driver-" + randomUUID();
  await finance.createPayment({
    id,
    rideId,
    method: "wallet",
    processor: "internal-wallet",
    status: "pending",
    amountCents: 21000,
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await finance.capturePayment({
    paymentId: id,
    processorEventId: randomUUID(),
  });
  await finance.settleRide({
    rideId,
    paymentId: id,
    driverId,
    totalAmountCents: 21000,
    platformCommissionCents: 1000,
    driverNetCents: 20000,
  });
  await finance.upsertDriverPayoutDestination({
    driverId,
    pixKeyType: "random",
    pixKey: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { finance, driverId };
}
export async function fixture(
  store: AsaasPayoutStore = new InMemoryAsaasPayoutStore(),
  repository?: FinanceRepository,
) {
  const { finance, driverId } = await fundedFinance(repository);
  const batch = await createManualDriverPayouts({
      finance,
      driverIds: [driverId],
      batchId: randomUUID(),
      executionMode: "api",
    }),
    payout = batch.created[0]!;
  let posts = 0,
    gets = 0,
    state = "PENDING",
    behavior = "normal";
  const transfer = {
    id: randomUUID(),
    externalReference: payout.id,
    value: payout.amountCents / 100,
    operationType: "PIX",
    bankAccount: { pixAddressKey: payout.pixKey },
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init ? { init } : {}) });
    if (init?.method === "POST") {
      posts++;
      assert.equal(url, "https://api-sandbox.asaas.com/v3/transfers");
      assert.equal(init.redirect, "error");
      const headers = new Headers(init.headers);
      assert.equal(
        headers.get("access_token"),
        "sandbox-api-key-fixture-only-12345",
      );
      assert.equal(headers.has("authorization"), false);
      const body = JSON.parse(String(init.body));
      assert.equal(body.externalReference, payout.id);
      assert.equal(body.value, 200);
      assert.equal(body.pixAddressKeyType, "EVP");
      assert.equal(body.pixAddressKey, payout.pixKey);
      assert.equal(body.scheduleDate, undefined);
      if (behavior.startsWith("timeout"))
        throw Error("request accepted; response lost");
      if (behavior === "rejected")
        return Response.json(
          { errors: [{ code: "invalid_action" }] },
          { status: 400 },
        );
    } else gets++;
    const data = {
      ...transfer,
      status: state,
      value: behavior === "mismatch" ? 0.01 : transfer.value,
    };
    return url.includes("?")
      ? Response.json({
          data: behavior === "timeout-missing" ? [] : [data],
          hasMore: false,
        })
      : Response.json(data);
  };
  const options = {
    environment: "sandbox" as const,
    apiKey: "sandbox-api-key-fixture-only-12345",
    webhookToken: "fixture-webhook-token-only-1234567890",
    startAfter: "2026-01-01T00:00:00Z",
    store,
    financeLookup: (id: string) => finance.findDriverPayoutById(id),
    fetcher,
  };
  return {
    finance,
    driverId,
    payout,
    store,
    provider: new AsaasDriverPayoutProvider(options),
    options,
    transfer,
    requests,
    counts: () => ({ posts, gets }),
    behavior: (v: string) => {
      behavior = v;
    },
    state: (v: string) => {
      state = v;
    },
  };
}
