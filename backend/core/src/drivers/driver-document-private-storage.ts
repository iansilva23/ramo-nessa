export const MAX_PRIVATE_DOCUMENT_BYTES = 20 * 1024 * 1024;

export class PrivateDocumentStorageError extends Error {
  constructor(
    public readonly code:
      | 'DOCUMENT_STORAGE_NOT_CONFIGURED'
      | 'DOCUMENT_STORAGE_UNAVAILABLE'
      | 'DOCUMENT_STORAGE_NOT_FOUND'
      | 'DOCUMENT_STORAGE_OBJECT_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'PrivateDocumentStorageError';
  }
}

export interface PrivateDocumentObject {
  bytes: Buffer;
  contentType: string;
}

export interface PrivateDocumentStorage {
  read(storageKey: string): Promise<PrivateDocumentObject>;
}

function cleanBaseUrl(raw: string, production: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DOCUMENT_STORAGE_BASE_URL é inválida.');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'DOCUMENT_STORAGE_BASE_URL deve ser uma origem HTTP(S) privada sem credenciais na URL.',
    );
  }
  if (production && url.protocol !== 'https:') {
    throw new Error(
      'DOCUMENT_STORAGE_BASE_URL deve usar HTTPS em produção.',
    );
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function objectUrl(baseUrl: URL, storageKey: string): URL {
  const encodedPath = storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(encodedPath, baseUrl);
}

export class HttpPrivateDocumentStorage
  implements PrivateDocumentStorage
{
  constructor(
    private readonly baseUrl: URL,
    private readonly authToken: string,
    private readonly timeoutMs = 5000,
  ) {}

  async read(storageKey: string): Promise<PrivateDocumentObject> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );
    try {
      const response = await fetch(objectUrl(this.baseUrl, storageKey), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.authToken}`,
          accept:
            'application/pdf,image/jpeg,image/png,application/octet-stream',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.status === 404) {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_NOT_FOUND',
          'Arquivo privado não encontrado no storage.',
        );
      }
      if (!response.ok) {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_UNAVAILABLE',
          'Storage privado indisponível para leitura.',
        );
      }

      const declaredLength = Number(
        response.headers.get('content-length') ?? Number.NaN,
      );
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_PRIVATE_DOCUMENT_BYTES
      ) {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_OBJECT_TOO_LARGE',
          'Arquivo privado excede o limite de 20 MB.',
        );
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_PRIVATE_DOCUMENT_BYTES) {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_OBJECT_TOO_LARGE',
          'Arquivo privado excede o limite de 20 MB.',
        );
      }
      const contentType =
        response.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() || 'application/octet-stream';

      return { bytes, contentType };
    } catch (error) {
      if (error instanceof PrivateDocumentStorageError) throw error;
      throw new PrivateDocumentStorageError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        'Não foi possível ler o storage privado.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPrivateDocumentStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PrivateDocumentStorage | null {
  const rawBaseUrl = env.DOCUMENT_STORAGE_BASE_URL?.trim();
  if (!rawBaseUrl) return null;

  const token = env.DOCUMENT_STORAGE_AUTH_TOKEN?.trim() ?? '';
  if (token.length < 24) {
    throw new Error(
      'DOCUMENT_STORAGE_AUTH_TOKEN deve ter pelo menos 24 caracteres.',
    );
  }
  const production = env.NODE_ENV === 'production';
  const baseUrl = cleanBaseUrl(rawBaseUrl, production);
  const rawTimeout = env.DOCUMENT_STORAGE_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number(rawTimeout) : 5000;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 250 ||
    timeoutMs > 30000
  ) {
    throw new Error(
      'DOCUMENT_STORAGE_TIMEOUT_MS deve ser inteiro entre 250 e 30000.',
    );
  }

  return new HttpPrivateDocumentStorage(baseUrl, token, timeoutMs);
}
