import type { RideRecord } from '../ride.js';
import {RECOVERABLE_RIDE_STATES} from '../ride-resumption.js';
import type {
  AdminRideListInput,
  AdminRideListPage,
  AdminPassengerRideSummary,
  AdminRideOperationalSummary,
  DriverRideSummary,
  RideChatMessageRecord,
  RideChatSenderType,
  RideRepository,
  PassengerRatingRecord,
} from '../ride-repository.js';

export class InMemoryRideRepository implements RideRepository {
  private readonly chatReads = new Set<string>();
  private readonly passengerRatings = new Map<string, PassengerRatingRecord>();
  private readonly rides = new Map<string, RideRecord>();
  private readonly chatMessages =
      new Map<string, RideChatMessageRecord[]>();

  async findPassengerRating(rideId: string, driverId: string): Promise<PassengerRatingRecord | null> {
    const rating = this.passengerRatings.get(rideId);
    return rating?.driverId === driverId ? structuredClone(rating) : null;
  }

  async recordPassengerRating(rating: PassengerRatingRecord): Promise<{rating: PassengerRatingRecord; created: boolean} | null> {
    const ride = this.rides.get(rating.rideId);
    if (ride?.state !== 'COMPLETED' || ride.driverId !== rating.driverId || ride.passengerId !== rating.passengerId) return null;
    const existing = this.passengerRatings.get(rating.rideId);
    if (existing != null) return existing.driverId === rating.driverId ? {rating: structuredClone(existing), created: false} : null;
    this.passengerRatings.set(rating.rideId, structuredClone(rating));
    return {rating: structuredClone(rating), created: true};
  }

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

  async findRecoverableByPassengerId(passengerId: string): Promise<RideRecord | null> {
    const matches=[...this.rides.values()].filter(r=>r.passengerId===passengerId && (RECOVERABLE_RIDE_STATES as readonly string[]).includes(r.state));
    const priority=(state:string)=>state==='IN_PROGRESS'?0:['DRIVER_ARRIVED','DRIVER_ASSIGNED','DRIVER_ARRIVING'].includes(state)?1:['PAID','SEARCHING_DRIVER','NO_DRIVER_FOUND'].includes(state)?2:3;
    matches.sort((a,b)=>priority(a.state)-priority(b.state)||b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
    return matches[0]?structuredClone(matches[0]):null;
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
      .sort((a, b) => Number(a.state === 'COMPLETED') - Number(b.state === 'COMPLETED') || Number(b.state === 'IN_PROGRESS') - Number(a.state === 'IN_PROGRESS') || b.updatedAt.localeCompare(a.updatedAt));

    return rides[0] == null ? null : structuredClone(rides[0]);
  }

  async listPendingDispatch(before: string, limit: number): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return [...this.rides.values()]
      .filter(ride => (ride.state === 'PAID' || ride.state === 'SEARCHING_DRIVER') &&
        ['paid', 'authorized'].includes(ride.paymentStatus) &&
        !ride.driverConsentRequired && ride.pickupLatitude != null &&
        ride.pickupLongitude != null && Date.parse(ride.updatedAt) <= Date.parse(before))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, safeLimit)
      .map(ride => structuredClone(ride));
  }

  async listNoDriverFoundBefore(
    before: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const beforeMs = Date.parse(before);
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return [...this.rides.values()]
      .filter(
        (ride) =>
          ride.state === 'NO_DRIVER_FOUND' &&
          Date.parse(ride.updatedAt) <= beforeMs,
      )
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, safeLimit)
      .map((ride) => structuredClone(ride));
  }

  async listRefundPendingBefore(
    before: string,
    limit: number,
  ): Promise<RideRecord[]> {
    const beforeMs = Date.parse(before);
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return [...this.rides.values()]
      .filter(
        (ride) =>
          ride.state === 'REFUND_PENDING' &&
          Date.parse(ride.updatedAt) <= beforeMs,
      )
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, safeLimit)
      .map((ride) => structuredClone(ride));
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

  async listRecentByDriverId(
    driverId: string,
    limit: number,
    from?: string,
    to?: string,
  ): Promise<RideRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const fromMs = from == null ? null : Date.parse(from);
    const toMs = to == null ? null : Date.parse(to);
    return [...this.rides.values()]
      .filter((ride) => ride.driverId === driverId)
      .filter((ride) => {
        const updatedAt = Date.parse(ride.updatedAt);
        if (fromMs != null && updatedAt < fromMs) return false;
        if (toMs != null && updatedAt >= toMs) return false;
        return true;
      })
      .sort((a, b) => {
        const updatedDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;
        return b.id.localeCompare(a.id);
      })
      .slice(0, safeLimit)
      .map((ride) => structuredClone(ride));
  }

  async getDriverRideSummary(
    driverId: string,
    from?: string,
    to?: string,
  ): Promise<DriverRideSummary> {
    const fromMs = from == null ? null : Date.parse(from);
    const toMs = to == null ? null : Date.parse(to);
    const rides = [...this.rides.values()]
      .filter((ride) => ride.driverId === driverId)
      .filter((ride) => {
        const updatedAt = Date.parse(ride.updatedAt);
        if (fromMs != null && updatedAt < fromMs) return false;
        if (toMs != null && updatedAt >= toMs) return false;
        return true;
      });
    const cancelledStates = new Set<RideRecord['state']>([
      'CANCELLED_BY_PASSENGER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_ADMIN',
    ]);
    const inProgressStates = new Set<RideRecord['state']>([
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
    ]);

    return {
      total: rides.length,
      completed: rides.filter((ride) => ride.state === 'COMPLETED').length,
      cancelled: rides.filter((ride) => cancelledStates.has(ride.state)).length,
      inProgress: rides.filter((ride) => inProgressStates.has(ride.state)).length,
      earningsCents: rides
        .filter((ride) => ride.state === 'COMPLETED')
        .reduce((sum, ride) => sum + ride.quote.driverNetCents, 0),
      grossCents: rides
        .filter((ride) => ride.state === 'COMPLETED')
        .reduce((sum, ride) => sum + ride.quote.totalAmountCents, 0),
      platformFeeCents: rides
        .filter((ride) => ride.state === 'COMPLETED')
        .reduce(
          (sum, ride) => sum + ride.quote.platformCommissionCents,
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

  async listChatMessages(
    rideId: string,
    limit: number,
    beforeId?: string,
  ): Promise<RideChatMessageRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const ordered = [...(this.chatMessages.get(rideId) ?? [])].sort((a,b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const index = beforeId == null ? ordered.length : ordered.findIndex(m => m.id === beforeId);
    const messages = ordered.slice(0, Math.max(0, index));
    return messages
      .slice(-safeLimit)
      .map((message) => structuredClone(message));
  }

  async countUnreadChatMessages(rideId: string, readerType: RideChatSenderType, readerId: string): Promise<number> {
    return (this.chatMessages.get(rideId) ?? []).filter(m => m.senderType !== readerType &&
      !this.chatReads.has(JSON.stringify([m.id, readerType, readerId]))).length;
  }

  async markChatMessagesRead(rideId: string, readerType: RideChatSenderType, readerId: string, messageIds: string[]): Promise<void> {
    const ids = new Set(messageIds);
    for (const m of this.chatMessages.get(rideId) ?? []) {
      if (m.senderType !== readerType && ids.has(m.id)) {
        this.chatReads.add(JSON.stringify([m.id, readerType, readerId]));
      }
    }
  }

  async appendChatMessage(
    message: RideChatMessageRecord,
  ): Promise<RideChatMessageRecord> {
    if (!this.rides.has(message.rideId)) {
      throw new Error('Ride not found.');
    }
    const messages = this.chatMessages.get(message.rideId) ?? [];
    messages.push(structuredClone(message));
    this.chatMessages.set(message.rideId, messages);
    return structuredClone(message);
  }

  async save(ride: RideRecord): Promise<RideRecord> {
    if (ride.state.startsWith('CANCELLED_')) ride = { ...ride, cancellationState: ride.state };
    if (!this.rides.has(ride.id)) {
      throw new Error('Ride not found.');
    }

    this.rides.set(ride.id, structuredClone(ride));
    return structuredClone(ride);
  }
}
