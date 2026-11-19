import { randomUUID } from 'node:crypto';

import type { AuthSubjectType } from '../auth/auth-session-repository.js';
import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import type {
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  LegalDocumentType,
  PrivacyRepository,
} from './privacy-repository.js';

export class PrivacyError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_LEGAL_DOCUMENT'
      | 'LEGAL_DOCUMENT_NOT_AVAILABLE'
      | 'INVALID_PRIVACY_PREFERENCES'
      | 'INVALID_PRIVACY_REQUEST'
      | 'DUPLICATE_PRIVACY_REQUEST'
      | 'PRIVACY_REQUEST_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PrivacyError';
  }
}

const REQUEST_TYPES = new Set<DataSubjectRequestType>([
  'access',
  'correction',
  'deletion',
  'anonymization',
  'portability',
  'consent_revocation',
]);

const REQUEST_STATUSES = new Set<DataSubjectRequestStatus>([
  'open',
  'in_progress',
  'completed',
  'rejected',
]);

function cleanSimpleText(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') {
    throw new PrivacyError(
      'INVALID_LEGAL_DOCUMENT',
      `${field} é obrigatório.`,
    );
  }
  const text = value.trim();
  if (
    text.length < min ||
    text.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  ) {
    throw new PrivacyError(
      'INVALID_LEGAL_DOCUMENT',
      `${field} possui conteúdo inválido.`,
    );
  }
  return text;
}

function parseDocumentType(value: unknown): LegalDocumentType {
  if (value === 'privacy_policy' || value === 'terms_of_use') {
    return value;
  }
  throw new PrivacyError(
    'INVALID_LEGAL_DOCUMENT',
    'Tipo de documento legal inválido.',
  );
}

function parseRequestType(value: unknown): DataSubjectRequestType {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (REQUEST_TYPES.has(normalized as DataSubjectRequestType)) {
    return normalized as DataSubjectRequestType;
  }
  throw new PrivacyError(
    'INVALID_PRIVACY_REQUEST',
    'Tipo de solicitação de privacidade inválido.',
  );
}

function optionalNote(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new PrivacyError(
      'INVALID_PRIVACY_REQUEST',
      'Observação da solicitação é inválida.',
    );
  }
  const note = value.trim();
  if (
    note.length < 1 ||
    note.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
  ) {
    throw new PrivacyError(
      'INVALID_PRIVACY_REQUEST',
      'Observação deve ter no máximo 1000 caracteres válidos.',
    );
  }
  return note;
}

function requestPublicView(request: {
  id: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  note?: string;
  response?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: request.id,
    requestType: request.requestType,
    status: request.status,
    ...(request.note == null ? {} : { note: request.note }),
    ...(request.response == null ? {} : { response: request.response }),
    ...(request.respondedAt == null
      ? {}
      : { respondedAt: request.respondedAt }),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export async function publicLegalDocuments(input: {
  repository: PrivacyRepository;
  now?: Date;
}) {
  const now = (input.now ?? new Date()).toISOString();
  const documents = await input.repository.listPublishedLegalDocuments(now);
  return {
    documents: documents.map((document) => ({
      documentType: document.documentType,
      version: document.version,
      title: document.title,
      content: document.content,
      effectiveAt: document.effectiveAt,
      publishedAt: document.publishedAt,
    })),
  };
}

export async function privacyOverview(input: {
  repository: PrivacyRepository;
  subjectType: AuthSubjectType;
  subjectId: string;
  now?: Date;
}) {
  const now = (input.now ?? new Date()).toISOString();
  const [documents, acceptances, preferences, requests] = await Promise.all([
    input.repository.listPublishedLegalDocuments(now),
    input.repository.listLegalAcceptances(
      input.subjectType,
      input.subjectId,
    ),
    input.repository.getPreferences(input.subjectType, input.subjectId),
    input.repository.listDataSubjectRequestsForSubject(
      input.subjectType,
      input.subjectId,
      50,
    ),
  ]);

  return {
    legalDocuments: documents.map((document) => {
      const acceptance = acceptances.find(
        (item) =>
          item.documentType === document.documentType &&
          item.documentVersion === document.version,
      );
      return {
        documentType: document.documentType,
        version: document.version,
        title: document.title,
        content: document.content,
        effectiveAt: document.effectiveAt,
        accepted: acceptance != null,
        acceptedAt: acceptance?.acceptedAt ?? null,
      };
    }),
    preferences: {
      marketingNotificationsEnabled:
        preferences?.marketingNotificationsEnabled ?? false,
      updatedAt: preferences?.updatedAt ?? null,
    },
    requests: requests.map(requestPublicView),
  };
}

export async function acceptCurrentLegalDocument(input: {
  repository: PrivacyRepository;
  subjectType: AuthSubjectType;
  subjectId: string;
  documentType: unknown;
  version: unknown;
  now?: Date;
}) {
  const documentType = parseDocumentType(input.documentType);
  if (
    typeof input.version !== 'number' ||
    !Number.isInteger(input.version) ||
    input.version < 1
  ) {
    throw new PrivacyError(
      'INVALID_LEGAL_DOCUMENT',
      'Versão do documento legal é inválida.',
    );
  }

  const now = input.now ?? new Date();
  const documents = await input.repository.listPublishedLegalDocuments(
    now.toISOString(),
  );
  const current = documents.find(
    (document) => document.documentType === documentType,
  );
  if (current == null || current.version !== input.version) {
    throw new PrivacyError(
      'LEGAL_DOCUMENT_NOT_AVAILABLE',
      'Esta versão do documento legal não está vigente.',
    );
  }

  const acceptance = await input.repository.acceptLegalDocument({
    id: randomUUID(),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    documentType,
    documentVersion: current.version,
    acceptedAt: now.toISOString(),
  });

  return {
    documentType: acceptance.documentType,
    version: acceptance.documentVersion,
    acceptedAt: acceptance.acceptedAt,
  };
}

export async function updatePrivacyPreferences(input: {
  repository: PrivacyRepository;
  subjectType: AuthSubjectType;
  subjectId: string;
  marketingNotificationsEnabled: unknown;
  now?: Date;
}) {
  if (typeof input.marketingNotificationsEnabled !== 'boolean') {
    throw new PrivacyError(
      'INVALID_PRIVACY_PREFERENCES',
      'Preferência de marketing deve ser verdadeira ou falsa.',
    );
  }
  const record = await input.repository.savePreferences({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    marketingNotificationsEnabled: input.marketingNotificationsEnabled,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
  return {
    marketingNotificationsEnabled: record.marketingNotificationsEnabled,
    updatedAt: record.updatedAt,
  };
}

export async function createDataSubjectRequest(input: {
  repository: PrivacyRepository;
  subjectType: AuthSubjectType;
  subjectId: string;
  requestType: unknown;
  note?: unknown;
  now?: Date;
}) {
  const requestType = parseRequestType(input.requestType);
  const note = optionalNote(input.note);
  const existing = await input.repository.listDataSubjectRequestsForSubject(
    input.subjectType,
    input.subjectId,
    100,
  );
  if (
    existing.some(
      (request) =>
        request.requestType === requestType &&
        (request.status === 'open' || request.status === 'in_progress'),
    )
  ) {
    throw new PrivacyError(
      'DUPLICATE_PRIVACY_REQUEST',
      'Já existe uma solicitação desse tipo em atendimento.',
    );
  }

  const now = input.now ?? new Date();
  const instant = now.toISOString();

  if (requestType === 'consent_revocation') {
    await input.repository.savePreferences({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      marketingNotificationsEnabled: false,
      updatedAt: instant,
    });
  }

  const request = await input.repository.createDataSubjectRequest({
    id: randomUUID(),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    requestType,
    status: 'open',
    ...(note == null ? {} : { note }),
    createdAt: instant,
    updatedAt: instant,
  });
  return requestPublicView(request);
}

export async function publishLegalDocument(input: {
  repository: PrivacyRepository;
  admin: AdminRepository;
  actor: AdminActor;
  documentType: unknown;
  title: unknown;
  content: unknown;
  effectiveAt?: unknown;
  now?: Date;
}) {
  const documentType = parseDocumentType(input.documentType);
  const title = cleanSimpleText(input.title, 'Título', 3, 120);
  const content = cleanSimpleText(input.content, 'Conteúdo', 50, 30000);
  const now = input.now ?? new Date();

  let effectiveAt = now.toISOString();
  if (input.effectiveAt != null && input.effectiveAt !== '') {
    if (typeof input.effectiveAt !== 'string') {
      throw new PrivacyError(
        'INVALID_LEGAL_DOCUMENT',
        'Data de vigência é inválida.',
      );
    }
    const parsed = new Date(input.effectiveAt);
    if (!Number.isFinite(parsed.getTime())) {
      throw new PrivacyError(
        'INVALID_LEGAL_DOCUMENT',
        'Data de vigência é inválida.',
      );
    }
    effectiveAt = parsed.toISOString();
  }

  const latest = await input.repository.latestLegalDocument(documentType);
  const version = (latest?.version ?? 0) + 1;
  const instant = now.toISOString();
  const document = await input.repository.createLegalDocument({
    documentType,
    version,
    title,
    content,
    status: 'published',
    effectiveAt,
    publishedAt: instant,
    createdAt: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'privacy.legal_document_published',
    targetType: 'legal_document',
    targetId: `${document.documentType}:v${document.version}`,
    metadata: {
      documentType: document.documentType,
      version: document.version,
      effectiveAt: document.effectiveAt,
    },
    createdAt: instant,
  });

  return document;
}

export async function listPrivacyRequestsForAdmin(input: {
  repository: PrivacyRepository;
  status?: unknown;
  limit?: number;
  cursor?: { createdAt: string; id: string };
}) {
  let status: DataSubjectRequestStatus | undefined;
  if (input.status != null && input.status !== '') {
    if (
      typeof input.status !== 'string' ||
      !REQUEST_STATUSES.has(input.status as DataSubjectRequestStatus)
    ) {
      throw new PrivacyError(
        'INVALID_PRIVACY_REQUEST',
        'Status da solicitação de privacidade é inválido.',
      );
    }
    status = input.status as DataSubjectRequestStatus;
  }
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const page = await input.repository.listDataSubjectRequestsForAdmin({
    limit,
    ...(status == null ? {} : { status }),
    ...(input.cursor == null ? {} : { cursor: input.cursor }),
  });
  const last = page.requests.at(-1);
  return {
    requests: page.requests,
    nextCursor:
      page.hasMore && last != null
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

export async function updatePrivacyRequestFromAdmin(input: {
  repository: PrivacyRepository;
  admin: AdminRepository;
  actor: AdminActor;
  id: string;
  status: unknown;
  response?: unknown;
  now?: Date;
}) {
  if (
    input.status !== 'in_progress' &&
    input.status !== 'completed' &&
    input.status !== 'rejected'
  ) {
    throw new PrivacyError(
      'INVALID_PRIVACY_REQUEST',
      'Status de atendimento é inválido.',
    );
  }

  let response: string | undefined;
  if (input.response != null && input.response !== '') {
    if (typeof input.response !== 'string') {
      throw new PrivacyError(
        'INVALID_PRIVACY_REQUEST',
        'Resposta do atendimento é inválida.',
      );
    }
    response = input.response.trim();
    if (
      response.length < 3 ||
      response.length > 4000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(response)
    ) {
      throw new PrivacyError(
        'INVALID_PRIVACY_REQUEST',
        'Resposta deve ter entre 3 e 4000 caracteres válidos.',
      );
    }
  }

  if (
    (input.status === 'completed' || input.status === 'rejected') &&
    response == null
  ) {
    throw new PrivacyError(
      'INVALID_PRIVACY_REQUEST',
      'Informe a resposta antes de concluir ou rejeitar a solicitação.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  const updated = await input.repository.updateDataSubjectRequest({
    id: input.id,
    status: input.status,
    ...(response == null ? {} : { response }),
    respondedByName: input.actor.name,
    respondedAt: instant,
    updatedAt: instant,
  });
  if (updated == null) {
    throw new PrivacyError(
      'PRIVACY_REQUEST_NOT_FOUND',
      'Solicitação de privacidade não encontrada.',
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'privacy.request_updated',
    targetType: 'data_subject_request',
    targetId: updated.id,
    metadata: {
      subjectType: updated.subjectType,
      requestType: updated.requestType,
      status: updated.status,
    },
    createdAt: instant,
  });

  return updated;
}
