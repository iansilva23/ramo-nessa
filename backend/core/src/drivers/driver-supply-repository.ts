import type { DriverSupplyRecord } from './driver-supply.js';

export interface DriverSupplyRepository {
  upsert(supply: DriverSupplyRecord, options?: { preserveRideState?: boolean }): Promise<DriverSupplyRecord>;
  findByDriverId(driverId: string): Promise<DriverSupplyRecord | null>;
  listOnline(): Promise<DriverSupplyRecord[]>;
  listFleet(): Promise<DriverSupplyRecord[]>;
}
