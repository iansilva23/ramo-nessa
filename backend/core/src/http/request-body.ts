import type { IncomingMessage } from 'node:http';

export const MAX_JSON_BODY_BYTES = 64 * 1024;

export class HttpRequestBodyError extends Error {
  constructor(
    public readonly code: 'PAYLOAD_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'HttpRequestBodyError';
  }
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const rawContentLength = request.headers['content-length'];
  const contentLengthValue = Array.isArray(rawContentLength)
    ? rawContentLength[0]
    : rawContentLength;
  const declaredLength =
    contentLengthValue == null ? Number.NaN : Number(contentLengthValue);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpRequestBodyError(
      'PAYLOAD_TOO_LARGE',
      `Corpo da requisição excede o limite de ${maxBytes} bytes.`,
    );
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maxBytes) {
      throw new HttpRequestBodyError(
        'PAYLOAD_TOO_LARGE',
        `Corpo da requisição excede o limite de ${maxBytes} bytes.`,
      );
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length === 0 ? {} : JSON.parse(raw);
}


export async function readBinaryBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const rawContentLength = request.headers['content-length'];
  const contentLengthValue = Array.isArray(rawContentLength)
    ? rawContentLength[0]
    : rawContentLength;
  const declaredLength =
    contentLengthValue == null ? Number.NaN : Number(contentLengthValue);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpRequestBodyError(
      'PAYLOAD_TOO_LARGE',
      `Corpo da requisição excede o limite de ${maxBytes} bytes.`,
    );
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maxBytes) {
      throw new HttpRequestBodyError(
        'PAYLOAD_TOO_LARGE',
        `Corpo da requisição excede o limite de ${maxBytes} bytes.`,
      );
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
