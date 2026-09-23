import type { RideRecord } from './ride.js';

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
  getAdminOperationalSummary(
    since: string,
  ): Promise<AdminRideOperationalSummary>;
  save(ride: RideRecord): Promise<RideRecord>;
}
