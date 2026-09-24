import type {
  DriverProfileRecord,
  DriverRatingResult,
  DriverRegistryRepository,
  DriverRegistryStatus,
  DriverVehicleRecord,
} from '../driver-registry-repository.js';

export class InMemoryDriverRegistryRepository
  implements DriverRegistryRepository {
  private readonly profiles = new Map<string, DriverProfileRecord>();
  private readonly vehicles = new Map<string, DriverVehicleRecord>();
  private readonly ratings = new Map<
    string,
    {
      passengerId: string;
      driverId: string;
      stars: number;
      createdAt: string;
    }
  >();
  private readonly photos = new Map<
    string,
    {
      bytes: Buffer;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      updatedAt: string;
    }
  >();

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

  async updateProfilePhoto(input: {
    driverId: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  }): Promise<DriverProfileRecord | null> {
    const found = this.profiles.get(input.driverId);
    if (found == null) return null;

    this.photos.set(input.driverId, {
      bytes: Buffer.from(input.bytes),
      mimeType: input.mimeType,
      updatedAt: input.updatedAt,
    });
    const updated = {
      ...found,
      photoUpdatedAt: input.updatedAt,
      updatedAt: input.updatedAt,
    };
    this.profiles.set(input.driverId, updated);
    return structuredClone(updated);
  }

  async findProfilePhoto(driverId: string): Promise<{
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  } | null> {
    const found = this.photos.get(driverId);
    if (found == null) return null;
    return {
      bytes: Buffer.from(found.bytes),
      mimeType: found.mimeType,
      updatedAt: found.updatedAt,
    };
  }

  async submitRating(input: {
    rideId: string;
    passengerId: string;
    driverId: string;
    stars: number;
    createdAt: string;
  }): Promise<DriverRatingResult> {
    const existing = this.ratings.get(input.rideId);
    if (existing != null) {
      const profile = this.profiles.get(existing.driverId);
      const ratings = [...this.ratings.values()].filter(
        (rating) => rating.driverId === existing.driverId,
      );
      const sum = ratings.reduce((total, rating) => total + rating.stars, 0);
      return {
        stars: existing.stars,
        ratingAverage: ratings.length === 0 ? 0 : sum / ratings.length,
        ratingCount: ratings.length,
        duplicate: true,
      };
    }

    const profile = this.profiles.get(input.driverId);
    if (profile == null) {
      throw new Error('Perfil do motorista não encontrado.');
    }

    this.ratings.set(input.rideId, {
      passengerId: input.passengerId,
      driverId: input.driverId,
      stars: input.stars,
      createdAt: input.createdAt,
    });

    const ratings = [...this.ratings.values()].filter(
      (rating) => rating.driverId === input.driverId,
    );
    const sum = ratings.reduce((total, rating) => total + rating.stars, 0);
    const ratingAverage = sum / ratings.length;
    this.profiles.set(input.driverId, {
      ...profile,
      ratingAverage,
      ratingCount: ratings.length,
      updatedAt: input.createdAt,
    });

    return {
      stars: input.stars,
      ratingAverage,
      ratingCount: ratings.length,
      duplicate: false,
    };
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
