import type { RideRecord } from './ride.js';

export interface AdminRideCursor {
  updatedAt: string;
  id: string;
}

export interface AdminRideListInput {
  states?: RideRecord['state'][] | undefined;
  search?: string | undefined;
  limit: number;
  cursor?: AdminRideCursor | undefined;
}

export interface AdminRideListPage {
  rides: RideRecord[];
  hasMore: boolean;
}

export interface AdminRideOperationalSummary {
  active: number;
  searchingDriver: number;
  driverOnTheWay: number;
  inProgress: number;
  completedLast24h: number;
  cancelledLast24h: number;
}

export interface RideRepository {
  create(ride: RideRecord): Promise<RideRecord>;
  findById(id: string): Promise<RideRecord | null>;
  findActiveByDriverId(driverId: string): Promise<RideRecord | null>;
  listAdminActive(limit: number): Promise<RideRecord[]>;
  listAdmin(input: AdminRideListInput): Promise<AdminRideListPage>;
  getAdminOperationalSummary(
    since: string,
  ): Promise<AdminRideOperationalSummary>;
  save(ride: RideRecord): Promise<RideRecord>;
}
