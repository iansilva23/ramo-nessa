import {
  validateDriverSupply,
  type DriverSupplyRecord,
} from '../driver-supply.js';
import type { DriverSupplyRepository } from '../driver-supply-repository.js';

export class InMemoryDriverSupplyRepository
    implements DriverSupplyRepository {
  private readonly supplies = new Map<string, DriverSupplyRecord>();

  async upsert(supply: DriverSupplyRecord, options?: { preserveRideState?: boolean }): Promise<DriverSupplyRecord> {
    const current = this.supplies.get(supply.driverId);
    let next = supply;
    if (options?.preserveRideState && current != null) {
      const { reservedRideId: _id, reservedUntil: _until, ...operational } = supply;
      next = { ...operational, busy: current.busy, online: current.busy ? current.online : supply.online,
        ...(current.reservedRideId == null ? {} : { reservedRideId: current.reservedRideId }),
        ...(current.reservedUntil == null ? {} : { reservedUntil: current.reservedUntil }) };
    }
    const validated = validateDriverSupply(structuredClone(next));
    this.supplies.set(validated.driverId, structuredClone(validated));
    return structuredClone(validated);
  }

  async findByDriverId(
    driverId: string,
  ): Promise<DriverSupplyRecord | null> {
    const supply = this.supplies.get(driverId);
    return supply == null ? null : structuredClone(supply);
  }

  async listOnline(): Promise<DriverSupplyRecord[]> {
    return [...this.supplies.values()]
      .filter((supply) => supply.online && !supply.busy)
      .map((supply) => structuredClone(supply));
  }

  async listFleet(): Promise<DriverSupplyRecord[]> {
    return [...this.supplies.values()]
      .filter((supply) => supply.online)
      .sort((a, b) =>
        b.locationUpdatedAt.localeCompare(a.locationUpdatedAt),
      )
      .map((supply) => structuredClone(supply));
  }
}
