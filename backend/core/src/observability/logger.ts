import { randomUUID } from 'node:crypto';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

function write(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields?: LogFields): void {
  write('info', event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  write('warn', event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  write('error', event, fields);
}

export function resolveRequestId(value?: string): string {
  const normalized = value?.trim();
  if (
    normalized != null &&
    normalized.length >= 8 &&
    normalized.length <= 100 &&
    /^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    return normalized;
  }
  return randomUUID();
}

export function errorFields(error: unknown): {
  errorName: string;
  errorMessage: string;
} {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message.slice(0, 500),
    };
  }
  return {
    errorName: 'UnknownError',
    errorMessage: 'Erro não identificado.',
  };
}
