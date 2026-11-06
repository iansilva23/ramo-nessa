import type { Pool } from "pg";

export interface AsaasAttempt {
  payoutId: string;
  environment: string;
  requestHash: string;
  transferId: string | null;
  rejected: boolean;
  createdAt: string;
}
export interface AsaasPayoutStore {
  readonly durable: boolean;
  begin(
    input: Pick<AsaasAttempt, "payoutId" | "environment" | "requestHash">,
  ): Promise<{ created: boolean; attempt: AsaasAttempt }>;
  get(payoutId: string): Promise<AsaasAttempt | null>;
  attach(payoutId: string, transferId: string): Promise<void>;
  reject(payoutId: string): Promise<void>;
  beginEvent(eventId: string, transferId: string): Promise<boolean>;
  completeEvent(eventId: string): Promise<void>;
}
type Row = {
  payout_id: string;
  environment: string;
  request_hash: string;
  transfer_id: string | null;
  rejected: boolean;
  created_at: Date;
};
const map = (r: Row): AsaasAttempt => ({
  payoutId: r.payout_id,
  environment: r.environment,
  requestHash: r.request_hash,
  transferId: r.transfer_id,
  rejected: r.rejected,
  createdAt: r.created_at.toISOString(),
});

export class PostgresAsaasPayoutStore implements AsaasPayoutStore {
  readonly durable = true;
  constructor(private readonly pool: Pool) {}
  async begin(
    input: Pick<AsaasAttempt, "payoutId" | "environment" | "requestHash">,
  ) {
    const result = await this.pool.query<Row>(
      `INSERT INTO asaas_driver_transfer_attempts (payout_id, environment, request_hash)
       VALUES ($1, $2, $3) ON CONFLICT (payout_id) DO NOTHING RETURNING *`,
      [input.payoutId, input.environment, input.requestHash],
    );
    const attempt = result.rows[0]
      ? map(result.rows[0])
      : await this.get(input.payoutId);
    if (!attempt) throw Error("Registro de envio Asaas indisponível.");
    return { created: result.rowCount === 1, attempt };
  }
  async get(payoutId: string) {
    const r = await this.pool.query<Row>(
      "SELECT * FROM asaas_driver_transfer_attempts WHERE payout_id = $1",
      [payoutId],
    );
    return r.rows[0] ? map(r.rows[0]) : null;
  }
  async attach(payoutId: string, transferId: string) {
    const r = await this.pool.query(
      `UPDATE asaas_driver_transfer_attempts SET transfer_id = $2
      WHERE payout_id = $1 AND rejected = false AND (transfer_id IS NULL OR transfer_id = $2)`,
      [payoutId, transferId],
    );
    if (r.rowCount !== 1)
      throw Error("Referência Asaas conflitante; conciliação necessária.");
  }
  async reject(payoutId: string) {
    const r = await this.pool.query(
      "UPDATE asaas_driver_transfer_attempts SET rejected = true WHERE payout_id = $1 AND transfer_id IS NULL",
      [payoutId],
    );
    if (r.rowCount !== 1)
      throw Error("Não foi possível registrar a rejeição Asaas.");
  }
  async beginEvent(eventId: string, transferId: string) {
    await this.pool.query(
      `INSERT INTO asaas_driver_transfer_events (event_id, transfer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, transferId],
    );
    const r = await this.pool.query<{
      transfer_id: string;
      processed: boolean;
    }>(
      "SELECT transfer_id, processed FROM asaas_driver_transfer_events WHERE event_id = $1",
      [eventId],
    );
    if (r.rows[0]?.transfer_id !== transferId)
      throw Error("Evento Asaas conflitante.");
    return r.rows[0].processed;
  }
  async completeEvent(eventId: string) {
    await this.pool.query(
      "UPDATE asaas_driver_transfer_events SET processed = true WHERE event_id = $1",
      [eventId],
    );
  }
}

// Tests only: runtime arming requires a durable store, including in sandbox.
export class InMemoryAsaasPayoutStore implements AsaasPayoutStore {
  readonly durable = false;
  private readonly attempts = new Map<string, AsaasAttempt>();
  private readonly events = new Map<
    string,
    { transferId: string; processed: boolean }
  >();
  async begin(
    input: Pick<AsaasAttempt, "payoutId" | "environment" | "requestHash">,
  ) {
    const existing = this.attempts.get(input.payoutId);
    if (existing) return { created: false, attempt: structuredClone(existing) };
    const attempt = {
      ...input,
      transferId: null,
      rejected: false,
      createdAt: new Date().toISOString(),
    };
    this.attempts.set(input.payoutId, attempt);
    return { created: true, attempt: structuredClone(attempt) };
  }
  async get(id: string) {
    return structuredClone(this.attempts.get(id) ?? null);
  }
  async attach(id: string, transferId: string) {
    const a = this.attempts.get(id);
    if (!a || a.rejected || (a.transferId && a.transferId !== transferId))
      throw Error("Referência Asaas conflitante.");
    a.transferId = transferId;
  }
  async reject(id: string) {
    const a = this.attempts.get(id);
    if (!a || a.transferId) throw Error("Rejeição Asaas conflitante.");
    a.rejected = true;
  }
  async beginEvent(id: string, transferId: string) {
    const existing = this.events.get(id);
    if (existing && existing.transferId !== transferId)
      throw Error("Evento Asaas conflitante.");
    if (!existing) this.events.set(id, { transferId, processed: false });
    return existing?.processed ?? false;
  }
  async completeEvent(id: string) {
    const e = this.events.get(id);
    if (e) e.processed = true;
  }
}
