import { randomUUID } from 'node:crypto';

import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type {
  DriverProfileRecord,
  DriverRegistryRepository,
  DriverRegistryStatus,
  DriverVehicleRecord,
} from './driver-registry-repository.js';
import type { UpsertDriverRegistryRequest } from './driver-registry-validation.js';
import type { DriverSupplyRepository } from './driver-supply-repository.js';

async function synchronizeOperationalSupply(input: {
  drivers: DriverSupplyRepository;
  profile: DriverProfileRecord;
  vehicle: DriverVehicleRecord;
  now: string;
}): Promise<void> {
  const supply = await input.drivers.findByDriverId(input.profile.driverId);
  if (supply == null) return;

  const approved =
    input.profile.status === 'approved' &&
    input.vehicle.status === 'approved';

  await input.drivers.upsert({
    ...supply,
    ...(approved
      ? {
          vehicleId: input.vehicle.id,
          categories: input.vehicle.categories,
          fourByFour: input.vehicle.fourByFour,
          seatCapacity: input.vehicle.seatCapacity,
        }
      : { online: false }),
    updatedAt: input.now,
  });
}

export class DriverRegistryError extends Error {
  constructor(
    public readonly code:
      | 'DRIVER_NOT_FOUND'
      | 'DRIVER_REGISTRY_NOT_FOUND'
      | 'DRIVER_VEHICLE_NOT_FOUND'
      | 'VEHICLE_PLATE_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'DriverRegistryError';
  }
}

export async function getDriverRegistryForAdmin(input: {
  identities: AuthOtpRepository;
  registry: DriverRegistryRepository;
  driverId: string;
}) {
  const identity = await input.identities.findIdentityBySubject(
    'driver',
    input.driverId,
  );
  if (identity == null) {
    throw new DriverRegistryError(
      'DRIVER_NOT_FOUND',
      'Motorista não foi provisionado.',
    );
  }

  const [profile, vehicle] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
  ]);

  return {
    identity: {
      driverId: identity.subjectId,
      phoneE164: identity.phoneE164,
      status: identity.status,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    },
    profile,
    vehicle,
    registryApproved:
      profile?.status === 'approved' &&
      vehicle?.status === 'approved',
  };
}

export async function upsertDriverRegistryFromAdmin(input: {
  identities: AuthOtpRepository;
  registry: DriverRegistryRepository;
  drivers: DriverSupplyRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  data: UpsertDriverRegistryRequest;
  now?: Date;
}) {
  const identity = await input.identities.findIdentityBySubject(
    'driver',
    input.driverId,
  );
  if (identity == null) {
    throw new DriverRegistryError(
      'DRIVER_NOT_FOUND',
      'Motorista precisa ser provisionado antes do cadastro.',
    );
  }

  const now = input.now ?? new Date();
  const instant = now.toISOString();
  const [existingProfile, existingVehicle, plateOwner] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
    input.registry.findVehicleByPlate(input.data.vehicle.plate),
  ]);

  if (
    plateOwner != null &&
    plateOwner.driverId !== input.driverId
  ) {
    throw new DriverRegistryError(
      'VEHICLE_PLATE_CONFLICT',
      'Placa já está vinculada a outro motorista.',
    );
  }

  const profile: DriverProfileRecord =
    await input.registry.upsertProfile({
      driverId: input.driverId,
      fullName: input.data.fullName,
      ...(input.data.preferredName == null
        ? {}
        : { preferredName: input.data.preferredName }),
      status: existingProfile?.status ?? 'pending',
      createdAt: existingProfile?.createdAt ?? instant,
      updatedAt: instant,
    });

  const vehicle: DriverVehicleRecord =
    await input.registry.upsertVehicle({
      id: existingVehicle?.id ?? randomUUID(),
      driverId: input.driverId,
      plateNormalized: input.data.vehicle.plate,
      make: input.data.vehicle.make,
      model: input.data.vehicle.model,
      modelYear: input.data.vehicle.modelYear,
      color: input.data.vehicle.color,
      categories: input.data.vehicle.categories,
      fourByFour: input.data.vehicle.fourByFour,
      seatCapacity: input.data.vehicle.seatCapacity,
      status: existingVehicle?.status ?? 'pending',
      createdAt: existingVehicle?.createdAt ?? instant,
      updatedAt: instant,
    });

  await synchronizeOperationalSupply({
    drivers: input.drivers,
    profile,
    vehicle,
    now: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.registry.upserted',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      profileStatus: profile.status,
      vehicleStatus: vehicle.status,
      categories: vehicle.categories,
      fourByFour: vehicle.fourByFour,
      seatCapacity: vehicle.seatCapacity,
    },
    createdAt: instant,
  });

  return {
    profile,
    vehicle,
    registryApproved:
      profile.status === 'approved' &&
      vehicle.status === 'approved',
  };
}

export async function setDriverRegistryStatusFromAdmin(input: {
  registry: DriverRegistryRepository;
  drivers: DriverSupplyRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  profileStatus?: DriverRegistryStatus | undefined;
  vehicleStatus?: DriverRegistryStatus | undefined;
  now?: Date;
}) {
  const [currentProfile, currentVehicle] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
  ]);
  if (currentProfile == null) {
    throw new DriverRegistryError(
      'DRIVER_REGISTRY_NOT_FOUND',
      'Perfil cadastral do motorista não encontrado.',
    );
  }
  if (currentVehicle == null) {
    throw new DriverRegistryError(
      'DRIVER_VEHICLE_NOT_FOUND',
      'Veículo do motorista não encontrado.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  const profile =
    input.profileStatus == null
      ? currentProfile
      : await input.registry.setProfileStatus({
          driverId: input.driverId,
          status: input.profileStatus,
          updatedAt: instant,
        });
  const vehicle =
    input.vehicleStatus == null
      ? currentVehicle
      : await input.registry.setVehicleStatus({
          driverId: input.driverId,
          status: input.vehicleStatus,
          updatedAt: instant,
        });

  if (profile == null) {
    throw new DriverRegistryError(
      'DRIVER_REGISTRY_NOT_FOUND',
      'Perfil cadastral do motorista não encontrado.',
    );
  }
  if (vehicle == null) {
    throw new DriverRegistryError(
      'DRIVER_VEHICLE_NOT_FOUND',
      'Veículo do motorista não encontrado.',
    );
  }

  await synchronizeOperationalSupply({
    drivers: input.drivers,
    profile,
    vehicle,
    now: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.registry.status_changed',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      previousProfileStatus: currentProfile.status,
      profileStatus: profile.status,
      previousVehicleStatus: currentVehicle.status,
      vehicleStatus: vehicle.status,
    },
    createdAt: instant,
  });

  return {
    profile,
    vehicle,
    registryApproved:
      profile.status === 'approved' &&
      vehicle.status === 'approved',
  };
}
