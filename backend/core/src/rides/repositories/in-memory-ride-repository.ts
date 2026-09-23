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

  async findActiveByDriverId(
    driverId: string,
  ): Promise<RideRecord | null> {
    const activeStates = new Set<RideRecord['state']>([
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);

    const rides = [...this.rides.values()]
      .filter(
        (ride) =>
          ride.driverId === driverId && activeStates.has(ride.state),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return rides[0] == null ? null : structuredClone(rides[0]);
  }

  async findCurrentByDriverId(
    driverId: string,
  ): Promise<RideRecord | null> {
    const current = [...this.rides.values()]
      .filter(
        (ride) =>
          ride.driverId === driverId &&
          (
            ride.state === 'DRIVER_ASSIGNED' ||
            ride.state === 'DRIVER_ARRIVING' ||
            ride.state === 'DRIVER_ARRIVED' ||
            ride.state === 'IN_PROGRESS' ||
            ride.state === 'COMPLETED'
          ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    return current == null ? null : structuredClone(current);
  }

  async save(ride: RideRecord): Promise<RideRecord> {
    if (!this.rides.has(ride.id)) {
      throw new Error('Ride not found.');
    }

    this.rides.set(ride.id, structuredClone(ride));
    return structuredClone(ride);
  }
}
