import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function argValue(name) {
  const prefix = '--' + name + '=';
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    values.set(
      trimmed.slice(0, index).trim(),
      trimmed.slice(index + 1).trim(),
    );
  }
  return values;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const envFile = resolve(
  here,
  argValue('env-file') || '.env',
);
const timeoutMs = Number(argValue('timeout-ms') || '5000');
if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30000) {
  throw new Error('--timeout-ms deve estar entre 500 e 30000.');
}

const env = parseEnv(await readFile(envFile, 'utf8'));
const domain = env.get('APP_DOMAIN')?.trim() ?? '';
if (
  !domain ||
  domain === 'CHANGE_ME' ||
  domain.includes('://') ||
  domain.includes('/')
) {
  throw new Error('APP_DOMAIN inválido no arquivo de homologação.');
}

const baseUrl = 'https://' + domain;
const checks = [
  { path: '/health', expectedType: 'application/json' },
  { path: '/ready', expectedType: 'application/json' },
  { path: '/admin/', expectedType: 'text/html' },
];

let failed = false;

for (const check of checks) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref();

  try {
    const response = await fetch(baseUrl + check.path, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'ramo-nessa-health-check/1',
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const ok =
      response.status >= 200 &&
      response.status < 300 &&
      contentType.toLowerCase().includes(check.expectedType);

    const event = {
      timestamp: new Date().toISOString(),
      endpoint: check.path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ok,
    };
    console.log(JSON.stringify(event));
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        endpoint: check.path,
        status: null,
        durationMs: Date.now() - startedAt,
        ok: false,
        error:
          error instanceof Error ? error.name : 'UnknownError',
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

if (failed) process.exit(1);
