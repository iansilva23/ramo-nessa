export interface IntegerSettingInput {
  name: string;
  value: string | undefined;
  defaultValue: number;
  min: number;
  max: number;
}

export function parseIntegerSetting(input: IntegerSettingInput): number {
  const raw = input.value?.trim();
  if (raw == null || raw.length === 0) return input.defaultValue;

  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < input.min ||
    parsed > input.max
  ) {
    throw new Error(
      `${input.name} deve ser um inteiro entre ${input.min} e ${input.max}.`,
    );
  }

  return parsed;
}

export function resolveCorePort(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseIntegerSetting({
    name: 'PORT',
    value: env.PORT,
    defaultValue: 8080,
    min: 1,
    max: 65535,
  });
}

export function resolveDbPoolMax(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseIntegerSetting({
    name: 'DB_POOL_MAX',
    value: env.DB_POOL_MAX,
    defaultValue: 10,
    min: 1,
    max: 100,
  });
}

export function resolveRoutingTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseIntegerSetting({
    name: 'ROUTING_TIMEOUT_MS',
    value: env.ROUTING_TIMEOUT_MS,
    defaultValue: 5000,
    min: 250,
    max: 30000,
  });
}


export function resolveShutdownTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseIntegerSetting({
    name: 'SHUTDOWN_TIMEOUT_MS',
    value: env.SHUTDOWN_TIMEOUT_MS,
    defaultValue: 10_000,
    min: 1_000,
    max: 60_000,
  });
}


export function assertMercadoPagoProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  if (env.MERCADO_PAGO_MODE?.trim() !== 'production') {
    throw new Error(
      'MERCADO_PAGO_MODE deve ser production em ambiente de produção.',
    );
  }

  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ?? '';
  if (accessToken.length < 20) {
    throw new Error(
      'MERCADO_PAGO_ACCESS_TOKEN é obrigatório em produção.',
    );
  }

  const webhookSecret = env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '';
  if (webhookSecret.length < 16) {
    throw new Error(
      'MERCADO_PAGO_WEBHOOK_SECRET é obrigatório em produção.',
    );
  }
}
