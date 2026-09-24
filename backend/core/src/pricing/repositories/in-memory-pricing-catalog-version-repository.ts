import type {
  PricingCatalogVersionRecord,
  PricingCatalogVersionRepository,
} from '../pricing-catalog-version-repository.js';

export class InMemoryPricingCatalogVersionRepository
  implements PricingCatalogVersionRepository {
  private readonly versions = new Map<string, PricingCatalogVersionRecord>();
  private nextVersion = 1;

  async createDraft(
    input: Parameters<PricingCatalogVersionRepository['createDraft']>[0],
  ): Promise<PricingCatalogVersionRecord> {
    const record: PricingCatalogVersionRecord = {
      id: input.id,
      versionNumber: this.nextVersion++,
      status: 'draft',
      snapshot: structuredClone(input.snapshot),
      createdBy: structuredClone(input.createdBy),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.versions.set(record.id, record);
    return structuredClone(record);
  }

  async findById(id: string): Promise<PricingCatalogVersionRecord | null> {
    const record = this.versions.get(id);
    return record == null ? null : structuredClone(record);
  }

  async list(limit: number): Promise<PricingCatalogVersionRecord[]> {
    return [...this.versions.values()]
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((record) => structuredClone(record));
  }

  async updateDraftSnapshot(
    input: Parameters<
      PricingCatalogVersionRepository['updateDraftSnapshot']
    >[0],
  ): Promise<PricingCatalogVersionRecord | null> {
    const current = this.versions.get(input.id);
    if (current == null || current.status !== 'draft') return null;
    const updated: PricingCatalogVersionRecord = {
      ...current,
      snapshot: structuredClone(input.snapshot),
      updatedAt: input.updatedAt,
    };
    this.versions.set(updated.id, updated);
    return structuredClone(updated);
  }

  async publish(
    input: Parameters<PricingCatalogVersionRepository['publish']>[0],
  ): Promise<PricingCatalogVersionRecord | null> {
    const current = this.versions.get(input.id);
    if (current == null || current.status !== 'draft') return null;

    const updated: PricingCatalogVersionRecord = {
      ...current,
      status: 'published',
      effectiveFrom: input.effectiveFrom,
      publishedBy: structuredClone(input.publishedBy),
      publishedAt: input.publishedAt,
      updatedAt: input.publishedAt,
    };
    this.versions.set(updated.id, updated);
    return structuredClone(updated);
  }

  async findEffective(at: string): Promise<PricingCatalogVersionRecord | null> {
    const timestamp = Date.parse(at);
    const found = [...this.versions.values()]
      .filter(
        (record) =>
          record.status === 'published' &&
          record.effectiveFrom != null &&
          Date.parse(record.effectiveFrom) <= timestamp,
      )
      .sort((a, b) => {
        const effectiveDiff =
          Date.parse(b.effectiveFrom!) - Date.parse(a.effectiveFrom!);
        return effectiveDiff !== 0
          ? effectiveDiff
          : b.versionNumber - a.versionNumber;
      })[0];

    return found == null ? null : structuredClone(found);
  }
}
