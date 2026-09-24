import type { ServiceCategory } from '../pricing/types.js';

export type DriverRegistryStatus =
  | 'pending'
  | 'approved'
  | 'suspended';

export interface DriverProfileRecord {
  driverId: string;
  fullName: string;
  preferredName?: string;
  status: DriverRegistryStatus;
  photoUpdatedAt?: string;
  ratingAverage?: number;
  ratingCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleRecord {
  id: string;
  driverId: string;
  plateNormalized: string;
  make: string;
  model: string;
  modelYear: number;
  color: string;
  categories: ServiceCategory[];
  fourByFour: boolean;
  seatCapacity: number;
  status: DriverRegistryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DriverRegistryRepository {
  findProfile(driverId: string): Promise<DriverProfileRecord | null>;
  upsertProfile(
    record: DriverProfileRecord,
  ): Promise<DriverProfileRecord>;
  setProfileStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverProfileRecord | null>;
  updateProfilePhoto(input: {
    driverId: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  }): Promise<DriverProfileRecord | null>;
  findProfilePhoto(driverId: string): Promise<{
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  } | null>;

  findVehicleByDriverId(
    driverId: string,
  ): Promise<DriverVehicleRecord | null>;
  findVehicleByPlate(
    plateNormalized: string,
  ): Promise<DriverVehicleRecord | null>;
  upsertVehicle(
    record: DriverVehicleRecord,
  ): Promise<DriverVehicleRecord>;
  setVehicleStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverVehicleRecord | null>;
}
