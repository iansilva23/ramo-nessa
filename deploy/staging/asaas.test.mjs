import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stagingAsaasConfiguration } from "./asaas.mjs";
test("staging Asaas is opt-in and never reads or needs credentials while disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramo-asaas-"));
  try {
    const env = join(dir, ".env");
    await writeFile(env, "PUSH_PROVIDER=disabled\n");
    assert.deepEqual(await stagingAsaasConfiguration(env), { enabled: false });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("staging Asaas validates private files, independent webhook token, explicit mode and cutover", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramo-asaas-"));
  try {
    const env = join(dir, ".env"),
      key = join(dir, "key"),
      token = join(dir, "token");
    await writeFile(key, "fixture-api-key-only-123456789012345", {
      mode: 0o600,
    });
    await writeFile(token, "fixture-webhook-token-only-987654321098765", {
      mode: 0o600,
    });
    const base = `ASAAS_PAYOUTS_ENABLED=true\nASAAS_PAYOUT_MODE=sandbox\nASAAS_PAYOUT_START_AFTER=2026-10-18T00:00:00Z\nASAAS_API_KEY_HOST_FILE=${key}\nASAAS_WEBHOOK_TOKEN_HOST_FILE=${token}\n`;
    await writeFile(env, base);
    assert.deepEqual(await stagingAsaasConfiguration(env), { enabled: true });
    await chmod(token, 0o644);
    await assert.rejects(stagingAsaasConfiguration(env));
    await chmod(token, 0o600);
    await writeFile(
      env,
      base.replace("ASAAS_PAYOUT_MODE=sandbox", "ASAAS_PAYOUT_MODE=unknown"),
    );
    await assert.rejects(stagingAsaasConfiguration(env));
    await writeFile(env, base + "ASAAS_PAYOUTS_ENABLED=true\n");
    await assert.rejects(stagingAsaasConfiguration(env));
    const link = join(dir, "link");
    await symlink(key, link);
    await writeFile(env, base.replace(key, link));
    await assert.rejects(stagingAsaasConfiguration(env));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
