import type {
  DriverProfileRecord,
  DriverRegistryRepository,
  DriverRegistryStatus,
  DriverVehicleRecord,
} from '../driver-registry-repository.js';

export class InMemoryDriverRegistryRepository
  implements DriverRegistryRepository {
  private readonly profiles = new Map<string, DriverProfileRecord>();
  private readonly vehicles = new Map<string, DriverVehicleRecord>();

  async findProfile(
    driverId: string,
  ): Promise<DriverProfileRecord | null> {
    const found = this.profiles.get(driverId);
    return found == null ? null : structuredClone(found);
  }

  async upsertProfile(
    record: DriverProfileRecord,
  ): Promise<DriverProfileRecord> {
    this.profiles.set(record.driverId, structuredClone(record));
    return structuredClone(record);
  }

  async setProfileStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverProfileRecord | null> {
    const found = this.profiles.get(input.driverId);
    if (found == null) return null;
    const updated = {
      ...found,
      status: input.status,
      updatedAt: input.updatedAt,
    };
    this.profiles.set(input.driverId, updated);
    return structuredClone(updated);
  }

  async findVehicleByDriverId(
    driverId: string,
  ): Promise<DriverVehicleRecord | null> {
    const found = [...this.vehicles.values()].find(
      (vehicle) => vehicle.driverId === driverId,
    );
    return found == null ? null : structuredClone(found);
  }

  async findVehicleByPlate(
    plateNormalized: string,
  ): Promise<DriverVehicleRecord | null> {
    const found = [...this.vehicles.values()].find(
      (vehicle) => vehicle.plateNormalized === plateNormalized,
    );
    return found == null ? null : structuredClone(found);
  }

  async upsertVehicle(
    record: DriverVehicleRecord,
  ): Promise<DriverVehicleRecord> {
    const existingPlate = [...this.vehicles.values()].find(
      (vehicle) =>
        vehicle.plateNormalized === record.plateNormalized &&
        vehicle.driverId !== record.driverId,
    );
    if (existingPlate != null) {
      throw new Error('Placa já vinculada a outro motorista.');
    }
    this.vehicles.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async setVehicleStatus(input: {
    driverId: string;
    status: DriverRegistryStatus;
    updatedAt: string;
  }): Promise<DriverVehicleRecord | null> {
    const found = [...this.vehicles.values()].find(
      (vehicle) => vehicle.driverId === input.driverId,
    );
    if (found == null) return null;
    const updated = {
      ...found,
      status: input.status,
      updatedAt: input.updatedAt,
    };
    this.vehicles.set(found.id, updated);
    return structuredClone(updated);
  }
}
