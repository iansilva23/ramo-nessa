import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from '../admin/admin-repository.js';
import type {
  DriverDocumentRecord,
  DriverDocumentRepository,
  DriverDocumentType,
} from './driver-document-repository.js';
import type {
  PrivateDocumentObject,
  PrivateDocumentStorage,
} from './driver-document-private-storage.js';

const TOKEN_PREFIX = 'rn_doc_inspect_v1';
const DEFAULT_TTL_SECONDS = 60;

interface InspectionPayload {
  v: 1;
  documentId: string;
  driverId: string;
  documentType: DriverDocumentType;
  storageKey: string;
  contentSha256: string;
  mimeType: DriverDocumentRecord['mimeType'];
  sizeBytes: number;
  expiresAt: string;
}

export class DriverDocumentInspectionError extends Error {
  constructor(
    public readonly code:
      | 'DOCUMENT_INSPECTION_TOKEN_INVALID'
      | 'DOCUMENT_INSPECTION_TOKEN_EXPIRED'
      | 'DOCUMENT_INSPECTION_INTEGRITY_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'DriverDocumentInspectionError';
  }
}

export function resolveDocumentInspectionEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env.DOCUMENT_INSPECTION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'DOCUMENT_INSPECTION_ENCRYPTION_KEY é obrigatória quando o storage documental está habilitado.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'DOCUMENT_INSPECTION_ENCRYPTION_KEY deve decodificar exatamente 32 bytes.',
    );
  }
  return key;
}

export function resolveDocumentInspectionTtlSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.DOCUMENT_INSPECTION_TTL_SECONDS?.trim();
  const value = raw ? Number(raw) : DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(value) || value < 30 || value > 300) {
    throw new Error(
      'DOCUMENT_INSPECTION_TTL_SECONDS deve ser inteiro entre 30 e 300.',
    );
  }
  return value;
}

function encryptPayload(payload: InspectionPayload, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(TOKEN_PREFIX, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decodeCanonicalBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid');
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('invalid');
  }

  return decoded;
}

function decryptPayload(token: string, key: Buffer): InspectionPayload {
  if (token.length < 80 || token.length > 4096) {
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_TOKEN_INVALID',
      'Token de inspeção documental inválido.',
    );
  }
  const [prefix, ivEncoded, tagEncoded, ciphertextEncoded] =
    token.split('.');
  if (
    prefix !== TOKEN_PREFIX ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded
  ) {
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_TOKEN_INVALID',
      'Token de inspeção documental inválido.',
    );
  }

  try {
    const iv = decodeCanonicalBase64Url(ivEncoded);
    const tag = decodeCanonicalBase64Url(tagEncoded);
    const ciphertext = decodeCanonicalBase64Url(
      ciphertextEncoded,
    );
    if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(TOKEN_PREFIX, 'utf8'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(plaintext) as InspectionPayload;

    if (
      payload.v !== 1 ||
      typeof payload.documentId !== 'string' ||
      typeof payload.driverId !== 'string' ||
      (payload.documentType !== 'driver_license' &&
        payload.documentType !== 'vehicle_registration') ||
      typeof payload.storageKey !== 'string' ||
      !/^[0-9a-f]{64}$/.test(payload.contentSha256) ||
      (payload.mimeType !== 'application/pdf' &&
        payload.mimeType !== 'image/jpeg' &&
        payload.mimeType !== 'image/png') ||
      !Number.isInteger(payload.sizeBytes) ||
      payload.sizeBytes < 1 ||
      typeof payload.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(payload.expiresAt))
    ) {
      throw new Error('invalid');
    }
    return payload;
  } catch (error) {
    if (error instanceof DriverDocumentInspectionError) throw error;
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_TOKEN_INVALID',
      'Token de inspeção documental inválido.',
    );
  }
}

function hasExpectedMagic(
  bytes: Buffer,
  mimeType: DriverDocumentRecord['mimeType'],
): boolean {
  if (mimeType === 'application/pdf') {
    return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (mimeType === 'image/png') {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return bytes.length >= png.length &&
      timingSafeEqual(bytes.subarray(0, png.length), png);
  }
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function validateObject(
  object: PrivateDocumentObject,
  payload: InspectionPayload,
): Buffer {
  const digest = createHash('sha256')
    .update(object.bytes)
    .digest('hex');
  const digestMatches = timingSafeEqual(
    Buffer.from(digest, 'hex'),
    Buffer.from(payload.contentSha256, 'hex'),
  );

  if (
    object.bytes.length !== payload.sizeBytes ||
    object.contentType !== payload.mimeType ||
    !digestMatches ||
    !hasExpectedMagic(object.bytes, payload.mimeType)
  ) {
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_INTEGRITY_FAILED',
      'O arquivo privado não corresponde aos metadados aprovados para inspeção.',
    );
  }
  return object.bytes;
}

export async function issueDriverDocumentInspection(input: {
  documents: DriverDocumentRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  documentType: DriverDocumentType;
  encryptionKey: Buffer;
  ttlSeconds?: number;
  now?: Date;
}) {
  const record = await input.documents.findCurrent(
    input.driverId,
    input.documentType,
  );
  if (record == null) {
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_TOKEN_INVALID',
      'Documento atual não encontrado para inspeção.',
    );
  }

  const now = input.now ?? new Date();
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(
    now.getTime() + ttlSeconds * 1000,
  ).toISOString();
  const token = encryptPayload(
    {
      v: 1,
      documentId: record.id,
      driverId: record.driverId,
      documentType: record.documentType,
      storageKey: record.storageKey,
      contentSha256: record.contentSha256,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      expiresAt,
    },
    input.encryptionKey,
  );

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.document.inspection_requested',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      documentId: record.id,
      documentType: record.documentType,
      expiresAt,
    },
    createdAt: now.toISOString(),
  });

  return {
    inspectionToken: token,
    expiresAt,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
  };
}

export async function readDriverDocumentInspection(input: {
  token: string;
  encryptionKey: Buffer;
  storage: PrivateDocumentStorage;
  now?: Date;
}) {
  const payload = decryptPayload(input.token, input.encryptionKey);
  const now = input.now ?? new Date();
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new DriverDocumentInspectionError(
      'DOCUMENT_INSPECTION_TOKEN_EXPIRED',
      'Link de inspeção documental expirado.',
    );
  }

  const object = await input.storage.read(payload.storageKey);
  const bytes = validateObject(object, payload);
  return {
    bytes,
    mimeType: payload.mimeType,
    documentType: payload.documentType,
    expiresAt: payload.expiresAt,
  };
}
