import type { DriverAvailability } from '../driver-availability.js';
import { validateDriverAvailability } from '../driver-availability.js';
import type { DriverAvailabilityRepository } from '../driver-availability-repository.js';

export class InMemoryDriverAvailabilityRepository
  implements DriverAvailabilityRepository
{
  private readonly drivers = new Map<string, DriverAvailability>();

  async upsert(driver: DriverAvailability): Promise<DriverAvailability> {
    validateDriverAvailability(driver);
    this.drivers.set(driver.driverId, structuredClone(driver));
    return structuredClone(driver);
  }

  async findByDriverId(
    driverId: string,
  ): Promise<DriverAvailability | null> {
    const driver = this.drivers.get(driverId);
    return driver == null ? null : structuredClone(driver);
  }

  async listAvailable(input: {
    category: DriverAvailability['serviceCategories'][number];
    freshAfter: Date;
  }): Promise<DriverAvailability[]> {
    const freshAfterMs = input.freshAfter.getTime();

    return [...this.drivers.values()]
      .filter(
        (driver) =>
          driver.status === 'available' &&
          driver.serviceCategories.includes(input.category) &&
          Date.parse(driver.lastSeenAt) >= freshAfterMs,
      )
      .map((driver) => structuredClone(driver));
  }
}
