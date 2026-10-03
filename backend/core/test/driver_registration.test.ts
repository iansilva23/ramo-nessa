import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { requestPhoneOtp, verifyPhoneOtp } from '../src/auth/phone-otp-service.js';
import { authenticateBearer } from '../src/auth/auth-service.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverDocumentRepository } from '../src/drivers/repositories/in-memory-driver-document-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { setDriverAuthStatusFromAdmin } from '../src/admin/admin-driver-auth-service.js';
import { submitDriverRegistration, driverRegistrationStatus } from '../src/drivers/driver-registration-service.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { PostgresDriverRegistryRepository } from '../src/drivers/repositories/postgres-driver-registry-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';
import type { AuthOtpRepository } from '../src/auth/auth-otp-repository.js';
import type { DriverRegistryRepository } from '../src/drivers/driver-registry-repository.js';

const data = { fullName: 'Motorista de Teste', vehicle: { plate: 'ABC1D23', make: 'Honda', model: 'CG', modelYear: 2024,
  color: 'Preta', categories: ['moto'], fourByFour: false, seatCapacity: 2 } };
const actor = { kind: 'api_key' as const, id: 'test-owner', name: 'Test owner' };
function delivery() {
  let sends = 0;
  return { externalProvider: 'entrar-whatsapp' as const, get sends() { return sends; },
    async sendCode() { sends++; return { reference: 'external-challenge-' + sends }; },
    async verifyCode(input: { code: string }) { return input.code === '123456'; } };
}
async function enroll(identities: AuthOtpRepository = new InMemoryAuthOtpRepository(), phone = '88999991111') {
  const sessions = new InMemoryAuthSessionRepository(); const otp = delivery();
  const requested = await requestPhoneOtp({ repository: identities, delivery: otp, subjectType: 'driver', phone, allowDriverRegistration: true });
  const verified = await verifyPhoneOtp({ repository: identities, sessions, delivery: otp, challengeId: requested.challengeId, code: '123456' });
  return { identities, sessions, otp, verified, headers: { authorization: 'Bearer ' + verified.accessToken } };
}
test('cadastro valida WhatsApp e emite sessão restrita; operação e websocket exigem liberação', async () => {
  const { identities, sessions, otp, verified, headers } = await enroll();
  assert.equal(otp.sends, 1);
  assert.equal((await identities.findIdentityBySubject('driver', verified.subjectId))?.driverRegistrationOnly, true);
  await assert.rejects(authenticateBearer({ repository: sessions, identities, headers, requiredType: 'driver' }), { code: 'DRIVER_REGISTRATION_PENDING' });
  assert.equal((await authenticateBearer({ repository: sessions, identities, headers, requiredType: 'driver', allowDriverRegistration: true })).subjectId, verified.subjectId);
  await assert.rejects(authenticateBearer({ repository: sessions, identities, headers, requiredType: 'passenger', allowDriverRegistration: true }), { code: 'AUTH_ROLE_MISMATCH' });
});
test('login desconhecido não envia; cadastro nunca reativa telefone suspenso', async () => {
  const identities = new InMemoryAuthOtpRepository(); const otp = delivery();
  await requestPhoneOtp({ repository: identities, delivery: otp, subjectType: 'driver', phone: '88999991111' });
  assert.equal(otp.sends, 0);
  const now = new Date().toISOString();
  await identities.createIdentity({ id: randomUUID(), subjectId: 'suspended-driver', subjectType: 'driver', phoneE164: '+5588999991111', status: 'suspended', createdAt: now, updatedAt: now });
  await requestPhoneOtp({ repository: identities, delivery: otp, subjectType: 'driver', phone: '88999991111', allowDriverRegistration: true });
  assert.equal(otp.sends, 0);
  assert.equal((await identities.findIdentityBySubject('driver', 'suspended-driver'))?.status, 'suspended');
});
test('envio cria perfil e veículo pendentes, ignora aprovação injetada e não sobrescreve decisões do ADM', async () => {
  const { identities, verified } = await enroll(); const registry = new InMemoryDriverRegistryRepository(); const documents = new InMemoryDriverDocumentRepository();
  const deps = { identities, registry, documents, driverId: verified.subjectId };
  assert.equal((await driverRegistrationStatus(deps)).status, 'incomplete');
  const submitted = await submitDriverRegistration({ ...deps, data: { ...data, status: 'approved', vehicle: { ...data.vehicle, status: 'approved' } } });
  assert.equal(submitted.profile?.status, 'pending'); assert.equal(submitted.vehicle?.status, 'pending');
  await registry.setProfileStatus({ driverId: verified.subjectId, status: 'approved', updatedAt: new Date().toISOString() });
  await registry.setVehicleStatus({ driverId: verified.subjectId, status: 'approved', updatedAt: new Date().toISOString() });
  await submitDriverRegistration({ ...deps, data: { ...data, fullName: 'Attempted overwrite' } });
  assert.equal((await registry.findProfile(verified.subjectId))?.fullName, data.fullName);
  assert.equal((await driverRegistrationStatus(deps)).status, 'pending');
});
test('liberação exige perfil, veículo, CNH e CRLV aprovados; depois libera sessão existente', async () => {
  const { identities, sessions, verified, headers } = await enroll(); const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository(); const admin = new InMemoryAdminRepository(); const driverId = verified.subjectId;
  await submitDriverRegistration({ identities, registry, documents, driverId, data });
  const activate = () => setDriverAuthStatusFromAdmin({ identities, sessions, registry, documents, admin, actor, driverId, status: 'active' });
  await assert.rejects(activate(), { code: 'DRIVER_REGISTRY_NOT_APPROVED' });
  const now = new Date().toISOString();
  await registry.setProfileStatus({ driverId, status: 'approved', updatedAt: now });
  await registry.setVehicleStatus({ driverId, status: 'approved', updatedAt: now });
  await assert.rejects(activate(), { code: 'DRIVER_REGISTRY_NOT_APPROVED' });
  for (const documentType of ['driver_license', 'vehicle_registration'] as const) {
    await documents.submitCurrent({ id: randomUUID(), driverId, documentType, storageKey: 'private/' + documentType, contentSha256: 'a'.repeat(64),
      mimeType: 'application/pdf', sizeBytes: 100, status: 'approved', isCurrent: true, submittedAt: now, createdAt: now, updatedAt: now });
  }
  assert.equal((await activate()).identity.driverRegistrationOnly, false);
  assert.equal((await authenticateBearer({ repository: sessions, identities, headers, requiredType: 'driver' })).subjectId, driverId);
  assert.equal((await driverRegistrationStatus({ identities, registry, documents, driverId })).status, 'approved');
});
test('placa duplicada não deixa cadastro parcialmente persistido', async () => {
  const first = await enroll(); const second = await enroll(first.identities, '88999992222');
  const registry = new InMemoryDriverRegistryRepository(); const documents = new InMemoryDriverDocumentRepository();
  await submitDriverRegistration({ identities: first.identities, registry, documents, driverId: first.verified.subjectId, data });
  await assert.rejects(submitDriverRegistration({ identities: first.identities, registry, documents, driverId: second.verified.subjectId, data }), { code: 'VEHICLE_PLATE_CONFLICT' });
  assert.equal(await registry.findProfile(second.verified.subjectId), null);
});

test('PostgreSQL: provisionamento concorrente converge e cadastro é atômico/idempotente', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = createPostgresPool(process.env.DATABASE_URL!); const identities = new PostgresAuthOtpRepository(pool); const registry: DriverRegistryRepository = new PostgresDriverRegistryRepository(pool);
  const phone = '+5588' + String(Math.floor(900000000 + Math.random() * 99999999)); const now = new Date().toISOString();
  const rows = await Promise.all(Array.from({ length: 4 }, () => identities.findOrCreateDriverRegistrationIdentity({ id: randomUUID(), subjectId: randomUUID(), subjectType: 'driver', phoneE164: phone, status: 'active', createdAt: now, updatedAt: now })));
  const driverId = rows[0]!.subjectId;
  try {
    assert.equal(new Set(rows.map(row => row.id)).size, 1); assert.equal(rows[0]!.driverRegistrationOnly, true);
    const documents = new InMemoryDriverDocumentRepository(); const deps = { identities, registry, documents, driverId };
    const plate = 'TST' + String(Math.floor(1000 + Math.random() * 8999));
    await Promise.all(Array.from({ length: 4 }, () => submitDriverRegistration({ ...deps, data: { ...data, vehicle: { ...data.vehicle, plate } } })));
    assert.equal((await registry.findProfile(driverId))?.status, 'pending');
    assert.equal((await registry.findVehicleByDriverId(driverId))?.status, 'pending');
    const other = await identities.findOrCreateDriverRegistrationIdentity({ id: randomUUID(), subjectId: randomUUID(), subjectType: 'driver', phoneE164: phone.replace('+5588', '+5585'), status: 'active', createdAt: now, updatedAt: now });
    try {
      await assert.rejects(submitDriverRegistration({ ...deps, driverId: other.subjectId, data: { ...data, vehicle: { ...data.vehicle, plate } } }), { code: 'VEHICLE_PLATE_CONFLICT' });
      assert.equal(await registry.findProfile(other.subjectId), null);
    } finally { await pool.query('DELETE FROM auth_identities WHERE id=$1', [other.id]); }
  } finally {
    await pool.query('DELETE FROM driver_profiles WHERE driver_id=$1', [driverId]);
    await pool.query('DELETE FROM auth_identities WHERE id=$1', [rows[0]!.id]);
    await pool.end();
  }
});
