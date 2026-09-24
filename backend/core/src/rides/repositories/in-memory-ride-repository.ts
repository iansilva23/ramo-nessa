import type { RideRecord } from '../ride.js';
import type {
  AdminRideListInput,
  AdminRideListPage,
  AdminPassengerRideSummary,
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

  async listAdminRecentByPassengerId(
    passengerId: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    return [...this.rides.values()]
      .filter((ride) => ride.passengerId === passengerId)
      .sort((a, b) => {
        const updatedDiff =
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;
        return b.id.localeCompare(a.id);
      })
      .slice(0, safeLimit)
      .map((ride) => structuredClone(ride));
  }

  async getAdminPassengerRideSummary(
    passengerId: string,
  ): Promise<AdminPassengerRideSummary> {
    const rides = [...this.rides.values()].filter(
      (ride) => ride.passengerId === passengerId,
    );
    const activeStates = new Set<RideRecord['state']>([
      'PAID',
      'SEARCHING_DRIVER',
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
    ]);
    const cancelledStates = new Set<RideRecord['state']>([
      'CANCELLED_BY_PASSENGER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_ADMIN',
    ]);

    return {
      total: rides.length,
      active: rides.filter((ride) => activeStates.has(ride.state)).length,
      completed: rides.filter((ride) => ride.state === 'COMPLETED').length,
      cancelled: rides.filter((ride) =>
        cancelledStates.has(ride.state),
      ).length,
      completedAmountCents: rides
        .filter((ride) => ride.state === 'COMPLETED')
        .reduce(
          (total, ride) => total + ride.quote.totalAmountCents,
          0,
        ),
    };
  }

  async listAdmin(
    input: AdminRideListInput,
  ): Promise<AdminRideListPage> {
    const stateSet =
      input.states == null
        ? null
        : new Set<RideRecord['state']>(input.states);
    const search = input.search?.trim().toLowerCase();
    const cursorTime =
      input.cursor == null ? null : Date.parse(input.cursor.updatedAt);

    const filtered = [...this.rides.values()]
      .filter(
        (ride) => stateSet == null || stateSet.has(ride.state),
      )
      .filter((ride) => {
        if (!search) return true;
        return [
          ride.id,
          ride.passengerId,
          ride.driverId,
          ride.reservedDriverId,
        ].some((value) =>
          value?.toLowerCase().includes(search),
        );
      })
      .filter((ride) => {
        if (
          input.createdFrom != null &&
          Date.parse(ride.createdAt) < Date.parse(input.createdFrom)
        ) {
          return false;
        }
        if (
          input.createdTo != null &&
          Date.parse(ride.createdAt) > Date.parse(input.createdTo)
        ) {
          return false;
        }
        return true;
      })
      .filter((ride) => {
        if (input.cursor == null || cursorTime == null) return true;
        const time = Date.parse(ride.updatedAt);
        return (
          time < cursorTime ||
          (time === cursorTime && ride.id < input.cursor.id)
        );
      })
      .sort((a, b) => {
        const updatedDiff =
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;
        return b.id.localeCompare(a.id);
      });

    const rows = filtered.slice(0, input.limit + 1);
    const hasMore = rows.length > input.limit;
    return {
      rides: rows
        .slice(0, input.limit)
        .map((ride) => structuredClone(ride)),
      hasMore,
    };
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
