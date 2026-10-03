import { randomUUID } from 'node:crypto';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import { AuthenticationError } from '../auth/auth-service.js';
import type { DriverRegistryRepository } from './driver-registry-repository.js';
import type { DriverDocumentRepository } from './driver-document-repository.js';
import { DriverRegistryError } from './driver-registry-service.js';
import { parseUpsertDriverRegistryRequest } from './driver-registry-validation.js';

type RegistrationDependencies = {
  identities: AuthOtpRepository; registry: DriverRegistryRepository;
  documents: DriverDocumentRepository; driverId: string; now?: Date;
};

export async function driverRegistrationStatus(input: RegistrationDependencies) {
  const identity = await input.identities.findIdentityBySubject('driver', input.driverId);
  if (identity == null || identity.status !== 'active') throw new AuthenticationError('AUTH_IDENTITY_DISABLED', 'Conta indisponível.');
  const [profile, vehicle, documents] = await Promise.all([
    input.registry.findProfile(input.driverId), input.registry.findVehicleByDriverId(input.driverId),
    input.documents.listCurrent(input.driverId),
  ]);
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  const required = ['driver_license', 'vehicle_registration'];
  const documentsApproved = required.every(type => documents.some(d =>
    d.documentType === type && d.status === 'approved' && (d.expiresOn == null || d.expiresOn >= today)));
  const documentsSubmitted = required.every(type => documents.some(d => d.documentType === type));
  const operational = identity.driverRegistrationOnly !== true && profile?.status === 'approved' && vehicle?.status === 'approved';
  return {
    driverId: identity.subjectId, phoneE164: identity.phoneE164, profile, vehicle,
    status: operational ? 'approved' : profile?.status === 'suspended' || vehicle?.status === 'suspended'
      ? 'suspended' : profile == null || vehicle == null ? 'incomplete' : 'pending',
    documentsSubmitted, documentsApproved,
    documents: documents.map(d => ({ documentType: d.documentType, status: d.status,
      reviewReason: d.rejectionReason ?? null, expiresOn: d.expiresOn ?? null })),
  };
}

export async function submitDriverRegistration(input: RegistrationDependencies & { data: unknown }) {
  const identity = await input.identities.findIdentityBySubject('driver', input.driverId);
  if (identity?.status !== 'active' || identity.driverRegistrationOnly !== true) {
    throw new AuthenticationError('AUTH_ROLE_MISMATCH', 'Este cadastro não pode ser alterado pelo aplicativo.');
  }
  const data = parseUpsertDriverRegistryRequest(input.data);
  const instant = (input.now ?? new Date()).toISOString();
  try {
    // Atomic initial submission, idempotent retries. Never overwrites admin decisions.
    await input.registry.createRegistration({
      profile: { driverId: input.driverId, fullName: data.fullName,
        ...(data.preferredName == null ? {} : { preferredName: data.preferredName }),
        status: 'pending', createdAt: instant, updatedAt: instant },
      vehicle: { id: randomUUID(), driverId: input.driverId, plateNormalized: data.vehicle.plate,
        make: data.vehicle.make, model: data.vehicle.model, modelYear: data.vehicle.modelYear,
        color: data.vehicle.color, categories: data.vehicle.categories, fourByFour: data.vehicle.fourByFour,
        seatCapacity: data.vehicle.seatCapacity, status: 'pending', createdAt: instant, updatedAt: instant },
    });
  } catch (error) {
    if ((error as Error).message === 'REGISTRATION_PLATE_CONFLICT') {
      throw new DriverRegistryError('VEHICLE_PLATE_CONFLICT', 'Esta placa já possui cadastro. Procure o suporte.');
    }
    throw error;
  }
  return driverRegistrationStatus(input);
}
