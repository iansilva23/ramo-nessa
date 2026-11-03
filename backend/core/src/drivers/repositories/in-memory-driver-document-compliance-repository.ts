import type {
  DriverDocumentComplianceControl,
  DriverDocumentComplianceRepository,
} from '../driver-document-compliance-repository.js';

export class InMemoryDriverDocumentComplianceRepository
  implements DriverDocumentComplianceRepository {
  private readonly records =
    new Map<string, DriverDocumentComplianceControl>();

  async get(
    driverId: string,
  ): Promise<DriverDocumentComplianceControl | null> {
    const record = this.records.get(driverId);
    return record == null ? null : structuredClone(record);
  }

  async save(
    input: DriverDocumentComplianceControl,
  ): Promise<DriverDocumentComplianceControl> {
    const record = structuredClone(input);
    this.records.set(input.driverId, record);
    return structuredClone(record);
  }
}
