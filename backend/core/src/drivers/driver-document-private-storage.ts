import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  resolve,
  sep,
} from 'node:path';

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

export interface WritablePrivateDocumentStorage
  extends PrivateDocumentStorage {
  write(
    storageKey: string,
    object: PrivateDocumentObject,
  ): Promise<void>;
}

function validateObjectSize(bytes: Buffer): void {
  if (bytes.length > MAX_PRIVATE_DOCUMENT_BYTES) {
    throw new PrivateDocumentStorageError(
      'DOCUMENT_STORAGE_OBJECT_TOO_LARGE',
      'Arquivo privado excede o limite de 20 MB.',
    );
  }
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

function contentTypeFromStorageKey(storageKey: string): string {
  switch (extname(storageKey).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export class HttpPrivateDocumentStorage
  implements WritablePrivateDocumentStorage
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
      validateObjectSize(bytes);
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

  async write(
    storageKey: string,
    object: PrivateDocumentObject,
  ): Promise<void> {
    validateObjectSize(object.bytes);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );
    try {
      const body = new Uint8Array(object.bytes.length);
      body.set(object.bytes);
      const response = await fetch(objectUrl(this.baseUrl, storageKey), {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${this.authToken}`,
          'content-type': object.contentType,
          'content-length': String(object.bytes.length),
        },
        body,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_UNAVAILABLE',
          'Storage privado indisponível para gravação.',
        );
      }
    } catch (error) {
      if (error instanceof PrivateDocumentStorageError) throw error;
      throw new PrivateDocumentStorageError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        'Não foi possível gravar no storage privado.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class LocalPrivateDocumentStorage
  implements WritablePrivateDocumentStorage
{
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  private objectPath(storageKey: string): string {
    const target = resolve(this.rootDirectory, storageKey);
    const prefix = this.rootDirectory.endsWith(sep)
      ? this.rootDirectory
      : this.rootDirectory + sep;
    if (!target.startsWith(prefix)) {
      throw new PrivateDocumentStorageError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        'Referência privada inválida para o storage local.',
      );
    }
    return target;
  }

  async read(storageKey: string): Promise<PrivateDocumentObject> {
    try {
      const bytes = await readFile(this.objectPath(storageKey));
      validateObjectSize(bytes);
      return {
        bytes,
        contentType: contentTypeFromStorageKey(storageKey),
      };
    } catch (error) {
      if (error instanceof PrivateDocumentStorageError) throw error;
      const code =
        error != null &&
        typeof error === 'object' &&
        'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (code === 'ENOENT') {
        throw new PrivateDocumentStorageError(
          'DOCUMENT_STORAGE_NOT_FOUND',
          'Arquivo privado não encontrado no storage.',
        );
      }
      throw new PrivateDocumentStorageError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        'Não foi possível ler o storage privado local.',
      );
    }
  }

  async write(
    storageKey: string,
    object: PrivateDocumentObject,
  ): Promise<void> {
    validateObjectSize(object.bytes);
    try {
      const target = this.objectPath(storageKey);
      await mkdir(dirname(target), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(target, object.bytes, {
        mode: 0o600,
      });
    } catch (error) {
      if (error instanceof PrivateDocumentStorageError) throw error;
      throw new PrivateDocumentStorageError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        'Não foi possível gravar no storage privado local.',
      );
    }
  }
}

export function createPrivateDocumentStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WritablePrivateDocumentStorage | null {
  const rawBaseUrl = env.DOCUMENT_STORAGE_BASE_URL?.trim();
  const rawLocalDir = env.DOCUMENT_STORAGE_LOCAL_DIR?.trim();

  if (rawBaseUrl && rawLocalDir) {
    throw new Error(
      'Configure apenas DOCUMENT_STORAGE_BASE_URL ou DOCUMENT_STORAGE_LOCAL_DIR.',
    );
  }

  if (rawLocalDir) {
    if (env.NODE_ENV === 'production' && !isAbsolute(rawLocalDir)) {
      throw new Error(
        'DOCUMENT_STORAGE_LOCAL_DIR deve ser absoluto em produção.',
      );
    }
    return new LocalPrivateDocumentStorage(rawLocalDir);
  }

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
