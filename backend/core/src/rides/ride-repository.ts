import type { RideRecord } from './ride.js';

export interface RideRepository {
  create(ride: RideRecord): Promise<RideRecord>;
  findById(id: string): Promise<RideRecord | null>;
  save(ride: RideRecord): Promise<RideRecord>;
}
