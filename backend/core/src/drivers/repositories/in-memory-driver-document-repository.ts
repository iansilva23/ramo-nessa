import type { AdminActor } from '../../admin/admin-repository.js';
import type {
  DriverDocumentRecord,
  DriverDocumentRepository,
  DriverDocumentStatus,
  DriverDocumentType,
} from '../driver-document-repository.js';

export class InMemoryDriverDocumentRepository
  implements DriverDocumentRepository {
  private readonly records = new Map<string, DriverDocumentRecord>();

  async listCurrent(driverId: string): Promise<DriverDocumentRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.driverId === driverId && record.isCurrent)
      .sort((a, b) => a.documentType.localeCompare(b.documentType))
      .map((record) => structuredClone(record));
  }

  async findCurrent(
    driverId: string,
    documentType: DriverDocumentType,
  ): Promise<DriverDocumentRecord | null> {
    const found = [...this.records.values()].find(
      (record) =>
        record.driverId === driverId &&
        record.documentType === documentType &&
        record.isCurrent,
    );
    return found == null ? null : structuredClone(found);
  }

  async submitCurrent(
    record: DriverDocumentRecord,
  ): Promise<DriverDocumentRecord> {
    for (const [id, existing] of this.records) {
      if (
        existing.driverId === record.driverId &&
        existing.documentType === record.documentType &&
        existing.isCurrent
      ) {
        this.records.set(id, { ...existing, isCurrent: false });
      }
    }
    const controlled=[...this.records.values()].some(r=>r.driverId===record.driverId&&r.documentType===record.documentType&&(r.validityControlled===true||(r.status==='approved'&&r.expiresOn!=null)));
    const stored={...record,...(controlled?{validityControlled:true}:{})};
    this.records.set(record.id, structuredClone(stored));
    return structuredClone(stored);
  }

  async reviewCurrent(input: {
    driverId: string;
    documentType: DriverDocumentType;
    expectedStatus: 'pending' | 'approved';
    expiresOn?: string | undefined;
    status: Exclude<DriverDocumentStatus, 'pending'>;
    rejectionReason?: string | undefined;
    reviewedAt: string;
    reviewedBy: AdminActor;
  }): Promise<DriverDocumentRecord | null> {
    const current = [...this.records.values()].find(
      (record) =>
        record.driverId === input.driverId &&
        record.documentType === input.documentType &&
        record.isCurrent &&
        record.status === input.expectedStatus,
    );
    if (current == null) return null;

    const {
      rejectionReason: _oldReason,
      reviewedAt: _oldReviewedAt,
      reviewedBy: _oldReviewedBy,
      ...base
    } = current;

    const updated: DriverDocumentRecord = {
      ...base,
      ...(input.expiresOn == null ? {} : {expiresOn:input.expiresOn}),
      status: input.status,
      ...(input.status==='approved'?{validityControlled:true}:{}),
      ...(input.rejectionReason == null
        ? {}
        : { rejectionReason: input.rejectionReason }),
      reviewedAt: input.reviewedAt,
      reviewedBy: structuredClone(input.reviewedBy),
      updatedAt: input.reviewedAt,
    };
    this.records.set(current.id, updated);
    return structuredClone(updated);
  }
}
