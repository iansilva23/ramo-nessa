import { createHash, timingSafeEqual } from "node:crypto";
import type { AsaasAttempt, AsaasPayoutStore } from "./asaas-payout-store.js";
import type {
  DriverPayoutProvider,
  DriverPayoutProviderResult,
} from "./driver-payout-provider.js";
import { DriverPayoutProviderError } from "./driver-payout-provider.js";
import type { DriverPayoutRecord, PixKeyType } from "./payout.js";

type Input = {
  payoutId: string;
  amountCents: number;
  pixKeyType: PixKeyType;
  pixKey: string;
};
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const record = (v: unknown): Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function unavailable(
  message = "Asaas indisponível. O valor permanece reservado para conciliação.",
): never {
  throw new DriverPayoutProviderError("PAYOUT_PROVIDER_UNAVAILABLE", message);
}
function invalid(): never {
  throw new DriverPayoutProviderError(
    "PAYOUT_PROVIDER_RESPONSE_INVALID",
    "Resposta Asaas não corresponde ao repasse reservado.",
  );
}
function pix(type: PixKeyType, key: string) {
  const types = {
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "EMAIL",
    phone: "PHONE",
    random: "EVP",
  };
  let value = key.trim();
  if (type === "cpf" || type === "cnpj") value = value.replace(/\D/g, "");
  if (type === "phone") {
    value = value.replace(/\D/g, "");
    if (value.length === 13 && value.startsWith("55")) value = value.slice(2);
    if (!/^\d{11}$/.test(value))
      throw new DriverPayoutProviderError(
        "PAYOUT_PROVIDER_CONFIG_INVALID",
        "A chave Pix de telefone precisa ter DDD e 11 dígitos.",
      );
  }
  if (!types[type] || !value)
    throw new DriverPayoutProviderError(
      "PAYOUT_PROVIDER_CONFIG_INVALID",
      "Chave Pix inválida.",
    );
  return { pixAddressKey: value, pixAddressKeyType: types[type] };
}
const hash = (input: Input) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        value: input.amountCents,
        ...pix(input.pixKeyType, input.pixKey),
      }),
    )
    .digest("hex");

export class AsaasDriverPayoutProvider implements DriverPayoutProvider {
  readonly name = "asaas";
  readonly environment: "sandbox" | "production";
  private readonly origin: string;
  constructor(
    private readonly options: {
      environment: "sandbox" | "production";
      apiKey: string;
      webhookToken: string;
      startAfter: string;
      store: AsaasPayoutStore;
      financeLookup(id: string): Promise<DriverPayoutRecord | null>;
      fetcher?: Fetcher;
      submissionsEnabled?: boolean;
    },
  ) {
    this.environment = options.environment;
    this.origin =
      options.environment === "production"
        ? "https://api.asaas.com"
        : "https://api-sandbox.asaas.com";
    if (
      !["sandbox", "production"].includes(options.environment) ||
      !/^\S{20,}$/.test(options.apiKey) ||
      !/^\S{32,255}$/.test(options.webhookToken) ||
      options.apiKey === options.webhookToken ||
      !Number.isFinite(Date.parse(options.startAfter))
    ) {
      throw new DriverPayoutProviderError(
        "PAYOUT_PROVIDER_CONFIG_INVALID",
        "Configuração privada Asaas incompleta ou inválida.",
      );
    }
  }
  private assertSubmissionsEnabled() {
    if (this.options.submissionsEnabled === false) {
      throw new DriverPayoutProviderError("PAYOUT_PROVIDER_CONFIG_INVALID", "Envios Asaas bloqueados: receptor somente para notificações.");
    }
  }
  submissionReference(payout: DriverPayoutRecord) {
    this.assertSubmissionsEnabled();
    if (
      payout.executionMode !== "api" ||
      payout.payoutKind === "anticipation" ||
      Date.parse(payout.createdAt) < Date.parse(this.options.startAfter)
    ) {
      throw new DriverPayoutProviderError(
        "PAYOUT_PROVIDER_CONFIG_INVALID",
        "Repasse anterior à ativação Asaas ou de execução manual. Não será enviado.",
      );
    }
    // Deterministic local validation happens before claiming the ledger state.
    if (!uuid.test(payout.id) || !Number.isSafeInteger(payout.amountCents) || payout.amountCents < 1 || !Number.isFinite(Date.parse(payout.createdAt))) invalid();
    pix(payout.pixKeyType, payout.pixKey);
    return this.reference(payout.id);
  }
  private reference(id: string) {
    return `asaas:${this.environment}:${id}`;
  }
  private parseReference(ref: string) {
    const prefix = `asaas:${this.environment}:`;
    const id = ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
    if (!uuid.test(id)) invalid();
    return id;
  }
  private async request(path: string, init: RequestInit = {}) {
    if (this.options.submissionsEnabled === false && (init.method ?? "GET").toUpperCase() !== "GET") this.assertSubmissionsEnabled();
    try {
      return await (this.options.fetcher ?? fetch)(this.origin + path, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          access_token: this.options.apiKey,
          "user-agent": "RamoNessa-DriverPayouts/1.0",
        },
      });
    } catch {
      return unavailable();
    }
  }
  private async json(response: Response) {
    try {
      return record(await response.json());
    } catch {
      return invalid();
    }
  }
  private async validateTransfer(
    payload: Record<string, unknown>,
    attempt: AsaasAttempt,
  ) {
    const payout = await this.options.financeLookup(attempt.payoutId);
    if (
      !payout ||
      payout.executionMode !== "api" ||
      payout.processor !== "asaas" ||
      payout.processorPayoutId !== this.reference(payout.id) ||
      payout.payoutKind === "anticipation"
    )
      invalid();
    if (
      attempt.environment !== this.environment ||
      hash({
        payoutId: payout.id,
        amountCents: payout.amountCents,
        pixKey: payout.pixKey,
        pixKeyType: payout.pixKeyType,
      }) !== attempt.requestHash
    )
      invalid();
    if (
      typeof payload.id !== "string" ||
      !uuid.test(payload.id) ||
      payload.externalReference !== payout.id ||
      typeof payload.value !== "number" ||
      Math.abs(payload.value * 100 - payout.amountCents) > 0.00001 ||
      payload.operationType !== "PIX" ||
      (attempt.transferId != null && attempt.transferId !== payload.id)
    )
      invalid();
    const remoteKey =
      record(payload.bankAccount).pixAddressKey ?? payload.pixAddressKey;
    if (
      typeof remoteKey !== "string" ||
      pix(payout.pixKeyType, remoteKey).pixAddressKey !==
        pix(payout.pixKeyType, payout.pixKey).pixAddressKey
    )
      invalid();
    const status = payload.status;
    if (
      ![
        "PENDING",
        "SCHEDULED",
        "BANK_PROCESSING",
        "BLOCKED",
        "DONE",
        "CANCELLED",
        "FAILED",
      ].includes(String(status))
    )
      invalid();
    await this.options.store.attach(payout.id, payload.id);
    return {
      providerPayoutId: this.reference(payout.id),
      status:
        status === "DONE"
          ? "paid"
          : status === "FAILED" || status === "CANCELLED"
            ? "failed"
            : "processing",
    } as DriverPayoutProviderResult;
  }
  async createPixPayout(input: Input): Promise<DriverPayoutProviderResult> {
    this.assertSubmissionsEnabled();
    if (
      !uuid.test(input.payoutId) ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents < 1
    )
      invalid();
    const payout = await this.options.financeLookup(input.payoutId);
    if (
      !payout ||
      payout.amountCents !== input.amountCents ||
      payout.pixKeyType !== input.pixKeyType ||
      payout.pixKey !== input.pixKey ||
      payout.status !== "processing" ||
      payout.processor !== this.name ||
      payout.processorPayoutId !== this.submissionReference(payout)
    )
      invalid();
    const claim = await this.options.store.begin({
      payoutId: input.payoutId,
      environment: this.environment,
      requestHash: hash(input),
    });
    if (
      claim.attempt.environment !== this.environment ||
      claim.attempt.requestHash !== hash(input)
    )
      invalid();
    // A second process/restart never posts again, even if the first response was lost.
    if (!claim.created)
      return this.getPayoutStatus(this.reference(input.payoutId));
    const response = await this.request("/v3/transfers", {
      method: "POST",
      body: JSON.stringify({
        value: input.amountCents / 100,
        operationType: "PIX",
        ...pix(input.pixKeyType, input.pixKey),
        externalReference: input.payoutId,
        description: "Repasse motorista Ramo Nessa",
      }),
    });
    // A documented validation rejection has no transfer; timeouts/5xx remain uncertain.
    if (response.status === 400) {
      const body = await this.json(response);
      if (Array.isArray(body.errors) && body.errors.length > 0 && !body.id) {
        await this.options.store.reject(input.payoutId);
        return {
          providerPayoutId: this.reference(input.payoutId),
          status: "failed",
        };
      }
      return unavailable();
    }
    if (!response.ok) return unavailable();
    return this.validateTransfer(await this.json(response), claim.attempt);
  }
  async getPayoutStatus(
    reference: string,
  ): Promise<DriverPayoutProviderResult> {
    const id = this.parseReference(reference);
    const attempt = await this.options.store.get(id);
    if (!attempt) return { providerPayoutId: reference, status: "processing" }; // crash before send: keep reserved, never guess/retry POST
    if (attempt.environment !== this.environment) invalid();
    if (attempt.rejected)
      return { providerPayoutId: reference, status: "failed" };
    if (attempt.transferId) {
      const response = await this.request(
        "/v3/transfers/" + encodeURIComponent(attempt.transferId),
      );
      if (!response.ok) return unavailable();
      return this.validateTransfer(await this.json(response), attempt);
    }
    // externalReference is not a documented list filter: scan bounded pages and compare exactly.
    const since = new Date(Date.parse(attempt.createdAt) - 86400000)
      .toISOString()
      .slice(0, 10);
    let found: Record<string, unknown> | null = null;
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({
        limit: "100",
        offset: String(page * 100),
        "dateCreated[ge]": since,
        type: "BANK_ACCOUNT",
      });
      const response = await this.request("/v3/transfers?" + query);
      if (!response.ok) return unavailable();
      const body = await this.json(response);
      if (!Array.isArray(body.data) || typeof body.hasMore !== "boolean")
        invalid();
      for (const item of body.data) {
        const t = record(item);
        if (t.externalReference !== id) continue;
        if (found) invalid(); // duplicates require operator reconciliation, never choose arbitrarily
        found = t;
      }
      if (!body.hasMore)
        return found
          ? this.validateTransfer(found, attempt)
          : { providerPayoutId: reference, status: "processing" };
    }
    return unavailable(
      "Busca Asaas incompleta. Concilie a transferência; nenhum reenvio será feito.",
    );
  }
  async receiveWebhook(
    token: string,
    raw: unknown,
  ): Promise<{
    duplicate: boolean;
    payoutId?: string;
    result?: DriverPayoutProviderResult;
  }> {
    const actual = Buffer.from(token),
      expected = Buffer.from(this.options.webhookToken);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new AsaasWebhookError(401, "Token do webhook Asaas inválido.");
    const body = record(raw),
      transfer = record(body.transfer);
    const events = [
      "TRANSFER_CREATED",
      "TRANSFER_PENDING",
      "TRANSFER_IN_BANK_PROCESSING",
      "TRANSFER_BLOCKED",
      "TRANSFER_DONE",
      "TRANSFER_FAILED",
      "TRANSFER_CANCELLED",
    ];
    if (
      typeof body.id !== "string" ||
      body.id.length < 3 ||
      body.id.length > 200 ||
      typeof transfer.id !== "string" ||
      !uuid.test(transfer.id) ||
      !events.includes(String(body.event))
    )
      throw new AsaasWebhookError(
        400,
        "Evento de transferência Asaas inválido.",
      );
    if (await this.options.store.beginEvent(body.id, transfer.id))
      return { duplicate: true };
    // Never trust status, amount, destination or externalReference sent by the webhook.
    const response = await this.request(
      "/v3/transfers/" + encodeURIComponent(transfer.id),
    );
    if (!response.ok) return unavailable();
    const canonical = await this.json(response);
    if (canonical.id !== transfer.id) invalid();
    const payoutId = canonical.externalReference;
    if (typeof payoutId !== "string" || !uuid.test(payoutId)) {
      await this.options.store.completeEvent(body.id);
      return { duplicate: false };
    }
    const attempt = await this.options.store.get(payoutId);
    // Other account transfers are out of scope and cannot change our ledger.
    if (!attempt) {
      await this.options.store.completeEvent(body.id);
      return { duplicate: false };
    }
    return {
      duplicate: false,
      payoutId,
      result: await this.validateTransfer(canonical, attempt),
    };
  }
  async completeWebhook(eventId: string) {
    await this.options.store.completeEvent(eventId);
  }
}

export class AsaasWebhookError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
