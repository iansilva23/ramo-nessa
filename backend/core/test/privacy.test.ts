import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryPrivacyRepository } from '../src/privacy/repositories/in-memory-privacy-repository.js';
import {
  PrivacyError,
  acceptCurrentLegalDocument,
  createDataSubjectRequest,
  privacyOverview,
  publishLegalDocument,
  updatePrivacyPreferences,
  updatePrivacyRequestFromAdmin,
} from '../src/privacy/privacy-service.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-privacy',
  name: 'Admin Privacidade',
};

test('documentos legais são versionados e aceite usa somente versão vigente', async () => {
  const repository = new InMemoryPrivacyRepository();
  const admin = new InMemoryAdminRepository();
  const now = new Date('2026-09-28T18:00:00.000Z');

  const privacy = await publishLegalDocument({
    repository,
    admin,
    actor,
    documentType: 'privacy_policy',
    title: 'Aviso de Privacidade',
    content:
      'Este aviso descreve de forma clara o tratamento de dados pessoais no Ramo Nessa para fins de teste.',
    now,
  });
  assert.equal(privacy.version, 1);

  const accepted = await acceptCurrentLegalDocument({
    repository,
    subjectType: 'passenger',
    subjectId: 'passenger-privacy',
    documentType: 'privacy_policy',
    version: 1,
    now,
  });
  assert.equal(accepted.version, 1);

  const overview = await privacyOverview({
    repository,
    subjectType: 'passenger',
    subjectId: 'passenger-privacy',
    now,
  });
  assert.equal(overview.legalDocuments[0]?.accepted, true);

  await assert.rejects(
    acceptCurrentLegalDocument({
      repository,
      subjectType: 'passenger',
      subjectId: 'passenger-privacy',
      documentType: 'privacy_policy',
      version: 2,
      now,
    }),
    (error: unknown) =>
      error instanceof PrivacyError &&
      error.code === 'LEGAL_DOCUMENT_NOT_AVAILABLE',
  );
});

test('marketing começa desligado e revogação cria protocolo e desliga preferência', async () => {
  const repository = new InMemoryPrivacyRepository();
  const initial = await privacyOverview({
    repository,
    subjectType: 'driver',
    subjectId: 'driver-privacy',
  });
  assert.equal(initial.preferences.marketingNotificationsEnabled, false);

  const enabled = await updatePrivacyPreferences({
    repository,
    subjectType: 'driver',
    subjectId: 'driver-privacy',
    marketingNotificationsEnabled: true,
  });
  assert.equal(enabled.marketingNotificationsEnabled, true);

  const request = await createDataSubjectRequest({
    repository,
    subjectType: 'driver',
    subjectId: 'driver-privacy',
    requestType: 'consent_revocation',
    note: 'Não quero mais receber comunicações promocionais.',
  });
  assert.equal(request.status, 'open');

  const after = await privacyOverview({
    repository,
    subjectType: 'driver',
    subjectId: 'driver-privacy',
  });
  assert.equal(after.preferences.marketingNotificationsEnabled, false);
});

test('pedido de exclusão é protocolado e não apaga dados automaticamente', async () => {
  const repository = new InMemoryPrivacyRepository();

  const request = await createDataSubjectRequest({
    repository,
    subjectType: 'passenger',
    subjectId: 'passenger-delete',
    requestType: 'deletion',
    note: 'Quero solicitar a exclusão dos dados que puderem ser eliminados.',
  });
  assert.equal(request.requestType, 'deletion');
  assert.equal(request.status, 'open');

  await assert.rejects(
    createDataSubjectRequest({
      repository,
      subjectType: 'passenger',
      subjectId: 'passenger-delete',
      requestType: 'deletion',
    }),
    (error: unknown) =>
      error instanceof PrivacyError &&
      error.code === 'DUPLICATE_PRIVACY_REQUEST',
  );

  const overview = await privacyOverview({
    repository,
    subjectType: 'passenger',
    subjectId: 'passenger-delete',
  });
  assert.equal(overview.requests.length, 1);
});

test('Admin responde solicitação com trilha de auditoria', async () => {
  const repository = new InMemoryPrivacyRepository();
  const admin = new InMemoryAdminRepository();

  const request = await createDataSubjectRequest({
    repository,
    subjectType: 'passenger',
    subjectId: 'passenger-access',
    requestType: 'access',
  });

  const updated = await updatePrivacyRequestFromAdmin({
    repository,
    admin,
    actor,
    id: request.id,
    status: 'completed',
    response:
      'Solicitação atendida. Os dados disponíveis foram preparados para consulta.',
    now: new Date('2026-09-28T19:00:00.000Z'),
  });

  assert.equal(updated.status, 'completed');
  assert.equal(updated.respondedByName, actor.name);

  const audit = await admin.listAudit(10);
  assert.equal(audit[0]?.action, 'privacy.request_updated');
  assert.equal(audit[0]?.targetId, request.id);
});
