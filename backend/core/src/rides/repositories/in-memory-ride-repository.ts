import type { RideRecord } from '../ride.js';
import type { RideRepository } from '../ride-repository.js';

export class InMemoryRideRepository implements RideRepository {
  private readonly rides = new Map<string, RideRecord>();

  async create(ride: RideRecord): Promise<RideRecord> {
    if (this.rides.has(ride.id)) {
      throw new Error('Ride already exists.');
    }

    this.rides.set(ride.id, structuredClone(ride));
    return structuredClone(ride);
  }

  async findById(id: string): Promise<RideRecord | null> {
    const ride = this.rides.get(id);
    return ride == null ? null : structuredClone(ride);
  }

  async save(ride: RideRecord): Promise<RideRecord> {
    if (!this.rides.has(ride.id)) {
      throw new Error('Ride not found.');
    }

    this.rides.set(ride.id, structuredClone(ride));
    return structuredClone(ride);
  }
}
