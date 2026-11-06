import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresPool } from "../src/db/postgres.js";
import { PostgresFinanceRepository } from "../src/payments/repositories/postgres-finance-repository.js";
import { PostgresAsaasPayoutStore } from "../src/payments/asaas-payout-store.js";
import { AsaasDriverPayoutProvider } from "../src/payments/asaas-driver-payout-provider.js";
import {
  processDriverPayout,
  applyConfirmedDriverPayoutResult,
} from "../src/payments/driver-payout-processing-service.js";
import { fixture } from "./helpers/asaas-fixture.js";
const enabled = process.env.RAMO_ASAAS_EPHEMERAL_PG === "true";
function localUrl() {
  const url = new URL(process.env.RAMO_ASAAS_TEST_PG_URL ?? "https://invalid");
  if (
    !enabled ||
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    url.pathname !== "/ramo_asaas_ci"
  )
    throw Error("Somente banco CI descartável autorizado.");
  return url.toString();
}
test(
  "real PostgreSQL: persisted attempt survives independent repositories/restart, concurrent sends and duplicate webhooks",
  { skip: !enabled },
  async () => {
    const pool = createPostgresPool(localUrl()),
      second = createPostgresPool(localUrl());
    try {
      const finance = new PostgresFinanceRepository(pool),
        create = finance.createPayment.bind(finance);
      finance.createPayment = async (payment) => {
        await pool.query(
          `INSERT INTO rides (id,passenger_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents,created_at,updated_at)
    VALUES ($1,'asaas-ci-passenger','AWAITING_PAYMENT','pending','prea','jijoca','car','day',1,'asaas-ci',21000,0,21000,1000,20000,now(),now())`,
          [payment.rideId],
        );
        return create(payment);
      };
      const f = await fixture(new PostgresAsaasPayoutStore(pool), finance);
      f.behavior("timeout-missing");
      const process = (
        provider = f.provider,
        repo: PostgresFinanceRepository = finance,
      ) =>
        processDriverPayout({ finance: repo, provider, payoutId: f.payout.id });
      const another = new AsaasDriverPayoutProvider({
        ...f.options,
        store: new PostgresAsaasPayoutStore(second),
        financeLookup: (id) =>
          new PostgresFinanceRepository(second).findDriverPayoutById(id),
      });
      await Promise.allSettled([
        process(),
        process(another, new PostgresFinanceRepository(second)),
      ]);
      assert.equal(f.counts().posts, 1);
      assert.equal(
        (await new PostgresAsaasPayoutStore(second).get(f.payout.id))
          ?.transferId,
        null,
      );
      assert.equal(
        (await finance.findDriverPayoutById(f.payout.id))?.status,
        "processing",
      );
      await assert.rejects(
        finance.cancelDriverPayout({ payoutId: f.payout.id }),
      );
      f.behavior("timeout-found");
      f.state("DONE");
      await process(another, new PostgresFinanceRepository(second));
      assert.equal(f.counts().posts, 1);
      assert.equal(
        (await new PostgresAsaasPayoutStore(pool).get(f.payout.id))?.transferId,
        f.transfer.id,
      );
      const payload = {
        id: "evt-postgres-" + f.payout.id,
        event: "TRANSFER_DONE",
        transfer: { id: f.transfer.id },
      };
      const event = await another.receiveWebhook(
        f.options.webhookToken,
        payload,
      );
      await applyConfirmedDriverPayoutResult({
        finance,
        provider: another,
        payoutId: event.payoutId!,
        result: event.result!,
      });
      await another.completeWebhook(payload.id);
      assert.deepEqual(
        await new AsaasDriverPayoutProvider(f.options).receiveWebhook(
          f.options.webhookToken,
          payload,
        ),
        { duplicate: true },
      );
      const ledger = await pool.query(
        "SELECT count(*)::int AS n FROM ledger_transactions WHERE reference_key=$1",
        [`driver-payout-paid:${f.payout.id}`],
      );
      assert.equal(ledger.rows[0].n, 1);
      assert.equal(
        await finance.getAccountBalanceCents(
          `driver:${f.driverId}:payout_pending`,
        ),
        0,
      );
      await finance.setDriverPayoutAutomaticEnabled({
        automaticEnabled: false,
        mode: "manual",
        anticipationMinimumCents: 12345,
        anticipationFeeCents: 678,
      });
      const terms = await new PostgresFinanceRepository(
        second,
      ).getDriverPayoutSettings();
      assert.equal(terms.anticipationMinimumCents, 12345);
      assert.equal(terms.anticipationFeeCents, 678);
      assert.equal(terms.mode, "manual");
      await assert.rejects(
        finance.setDriverPayoutAutomaticEnabled({
          automaticEnabled: false,
          mode: "manual",
          anticipationMinimumCents: 100,
          anticipationFeeCents: 100,
        }),
      );
    } finally {
      await pool.end();
      await second.end();
    }
  },
);
