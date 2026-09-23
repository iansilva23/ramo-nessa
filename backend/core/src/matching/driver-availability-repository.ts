import type { ServiceCategory } from '../pricing/types.js';
import type { DriverAvailability } from './driver-availability.js';

export interface DriverAvailabilityRepository {
  upsert(driver: DriverAvailability): Promise<DriverAvailability>;
  findByDriverId(driverId: string): Promise<DriverAvailability | null>;
  listAvailable(input: {
    category: ServiceCategory;
    freshAfter: Date;
  }): Promise<DriverAvailability[]>;
}
