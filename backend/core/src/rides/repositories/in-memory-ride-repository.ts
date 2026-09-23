import type { RideRecord } from '../ride.js';
import type {
  AdminRideOperationalSummary,
  RideRepository,
} from '../ride-repository.js';

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

  async listAdminActive(limit: number): Promise<RideRecord[]> {
    const activeStates = new Set<RideRecord['state']>([
      'PAID',
      'SEARCHING_DRIVER',
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
    ]);

    return [...this.rides.values()]
      .filter((ride) => activeStates.has(ride.state))
      .sort((a, b) => {
        const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;
        return b.id.localeCompare(a.id);
      })
      .slice(0, limit)
      .map((ride) => structuredClone(ride));
  }

  async getAdminOperationalSummary(
    since: string,
  ): Promise<AdminRideOperationalSummary> {
    const sinceMs = Date.parse(since);
    const rides = [...this.rides.values()];
    const isRecent = (ride: RideRecord) =>
      Date.parse(ride.updatedAt) >= sinceMs;

    return {
      active: rides.filter((ride) =>
        new Set<RideRecord['state']>([
          'PAID',
          'SEARCHING_DRIVER',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'IN_PROGRESS',
        ]).has(ride.state),
      ).length,
      searchingDriver: rides.filter((ride) =>
        ride.state === 'PAID' ||
        ride.state === 'SEARCHING_DRIVER',
      ).length,
      driverOnTheWay: rides.filter((ride) =>
        ride.state === 'DRIVER_ASSIGNED' ||
        ride.state === 'DRIVER_ARRIVING' ||
        ride.state === 'DRIVER_ARRIVED',
      ).length,
      inProgress: rides.filter(
        (ride) => ride.state === 'IN_PROGRESS',
      ).length,
      completedLast24h: rides.filter(
        (ride) => ride.state === 'COMPLETED' && isRecent(ride),
      ).length,
      cancelledLast24h: rides.filter(
        (ride) =>
          isRecent(ride) &&
          (
            ride.state === 'CANCELLED_BY_PASSENGER' ||
            ride.state === 'CANCELLED_BY_DRIVER' ||
            ride.state === 'CANCELLED_BY_ADMIN'
          ),
      ).length,
    };
  }

  async save(ride: RideRecord): Promise<RideRecord> {
    if (!this.rides.has(ride.id)) {
      throw new Error('Ride not found.');
    }

    this.rides.set(ride.id, structuredClone(ride));
    return structuredClone(ride);
  }
}
