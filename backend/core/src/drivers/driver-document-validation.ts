import type {
  DriverDocumentStatus,
} from './driver-document-repository.js';

export class InvalidDriverDocumentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDriverDocumentRequestError';
  }
}

export interface SubmitDriverDocumentRequest {
  storageKey: string;
  contentSha256: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  expiresOn?: string;
}

export interface ReviewDriverDocumentRequest {
  status: Exclude<DriverDocumentStatus, 'pending'>;
  rejectionReason?: string;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

function cleanStorageKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidDriverDocumentRequestError(
      'storageKey é obrigatório.',
    );
  }
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 512 ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new InvalidDriverDocumentRequestError(
      'storageKey deve ser uma referência privada opaca.',
    );
  }
  return normalized;
}

function cleanExpiration(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new InvalidDriverDocumentRequestError(
      'expiresOn deve usar YYYY-MM-DD.',
    );
  }
  return value;
}

export function parseSubmitDriverDocumentRequest(
  input: unknown,
): SubmitDriverDocumentRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverDocumentRequestError(
      'body deve ser um objeto.',
    );
  }
  const value = input as Record<string, unknown>;

  if (
    typeof value.contentSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.contentSha256)
  ) {
    throw new InvalidDriverDocumentRequestError(
      'contentSha256 deve ser SHA-256 hexadecimal em minúsculas.',
    );
  }

  if (
    typeof value.mimeType !== 'string' ||
    !ALLOWED_MIME_TYPES.has(value.mimeType)
  ) {
    throw new InvalidDriverDocumentRequestError(
      'mimeType permitido: image/jpeg, image/png ou application/pdf.',
    );
  }

  if (
    typeof value.sizeBytes !== 'number' ||
    !Number.isInteger(value.sizeBytes) ||
    value.sizeBytes < 1 ||
    value.sizeBytes > 20 * 1024 * 1024
  ) {
    throw new InvalidDriverDocumentRequestError(
      'sizeBytes deve ficar entre 1 byte e 20 MB.',
    );
  }

  const expiresOn = cleanExpiration(value.expiresOn);

  return {
    storageKey: cleanStorageKey(value.storageKey),
    contentSha256: value.contentSha256,
    mimeType: value.mimeType as SubmitDriverDocumentRequest['mimeType'],
    sizeBytes: value.sizeBytes,
    ...(expiresOn == null ? {} : { expiresOn }),
  };
}

function cleanRejectionReason(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidDriverDocumentRequestError(
      'rejectionReason é obrigatório ao rejeitar.',
    );
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 3 ||
    normalized.length > 240 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new InvalidDriverDocumentRequestError(
      'rejectionReason deve ter entre 3 e 240 caracteres.',
    );
  }
  return normalized;
}

export function parseReviewDriverDocumentRequest(
  input: unknown,
): ReviewDriverDocumentRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverDocumentRequestError(
      'body deve ser um objeto.',
    );
  }
  const value = input as Record<string, unknown>;
  const status = value.status;

  if (
    status !== 'approved' &&
    status !== 'rejected' &&
    status !== 'expired'
  ) {
    throw new InvalidDriverDocumentRequestError(
      'status deve ser approved, rejected ou expired.',
    );
  }

  if (status === 'rejected') {
    return {
      status,
      rejectionReason: cleanRejectionReason(value.rejectionReason),
    };
  }

  if (value.rejectionReason != null && value.rejectionReason !== '') {
    throw new InvalidDriverDocumentRequestError(
      'rejectionReason só pode ser enviado ao rejeitar.',
    );
  }

  return { status };
}
