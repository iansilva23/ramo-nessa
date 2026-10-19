import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
export async function stagingAsaasConfiguration(envFile) {
  const values = new Map();
  for (const line of (await readFile(envFile, "utf8")).split(/\r?\n/)) {
    const match = line
      .trim()
      .match(
        /^(ASAAS_PAYOUTS_ENABLED|ASAAS_PAYOUT_MODE|ASAAS_PAYOUT_START_AFTER|ASAAS_API_KEY_HOST_FILE|ASAAS_WEBHOOK_TOKEN_HOST_FILE)\s*=(.*)$/,
      );
    if (!match) continue;
    if (values.has(match[1])) throw Error("Configuração Asaas duplicada.");
    values.set(match[1], match[2].trim());
  }
  const enabled = values.get("ASAAS_PAYOUTS_ENABLED") ?? "false";
  if (!["true", "false"].includes(enabled))
    throw Error("ASAAS_PAYOUTS_ENABLED deve ser true ou false.");
  if (enabled === "false") return { enabled: false };
  if (!["sandbox", "production"].includes(values.get("ASAAS_PAYOUT_MODE")))
    throw Error("Escolha explicitamente o ambiente Asaas.");
  const startAfter = values.get("ASAAS_PAYOUT_START_AFTER") ?? "";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(startAfter) ||
    !Number.isFinite(Date.parse(startAfter))
  )
    throw Error(
      "Use uma data UTC ISO válida para o início dos novos repasses.",
    );
  const secrets = [];
  for (const name of [
    "ASAAS_API_KEY_HOST_FILE",
    "ASAAS_WEBHOOK_TOKEN_HOST_FILE",
  ]) {
    const path = values.get(name) ?? "";
    if (!isAbsolute(path) || /[\x00-\x20$]/.test(path))
      throw Error(
        "Arquivo Asaas deve usar caminho privado absoluto sem interpolação.",
      );
    try {
      const info = await lstat(path);
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 4096)
        throw Error();
      const secret = (await readFile(path, "utf8")).trim();
      if (
        !/^\S{20,}$/.test(secret) ||
        (name.includes("WEBHOOK") && !/^\S{32,255}$/.test(secret))
      )
        throw Error();
      secrets.push(secret);
    } catch {
      throw Error(
        "Credencial Asaas deve ser arquivo regular legível e privado (0600).",
      );
    }
  }
  if (secrets[0] === secrets[1])
    throw Error("Webhook deve usar token próprio, diferente da API Key Asaas.");
  return { enabled: true };
}
