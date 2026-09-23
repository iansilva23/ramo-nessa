import {
  validateDriverSupply,
  type DriverSupplyRecord,
} from '../driver-supply.js';
import type { DriverSupplyRepository } from '../driver-supply-repository.js';

export class InMemoryDriverSupplyRepository
    implements DriverSupplyRepository {
  private readonly supplies = new Map<string, DriverSupplyRecord>();

  async upsert(supply: DriverSupplyRecord): Promise<DriverSupplyRecord> {
    const validated = validateDriverSupply(structuredClone(supply));
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
      .filter((supply) => supply.online)
      .map((supply) => structuredClone(supply));
  }
}
