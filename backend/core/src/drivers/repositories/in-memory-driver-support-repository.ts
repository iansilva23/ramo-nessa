import type {
  DriverSupportRepository,
  DriverSupportTicketRecord,
} from '../driver-support-repository.js';

export class InMemoryDriverSupportRepository
  implements DriverSupportRepository {
  private readonly tickets =
      new Map<string, DriverSupportTicketRecord>();

  async create(
    ticket: DriverSupportTicketRecord,
  ): Promise<DriverSupportTicketRecord> {
    if (this.tickets.has(ticket.id)) {
      throw new Error('Chamado de suporte duplicado.');
    }
    this.tickets.set(ticket.id, structuredClone(ticket));
    return structuredClone(ticket);
  }

  async listByDriver(
    driverId: string,
    limit: number,
  ): Promise<DriverSupportTicketRecord[]> {
    return [...this.tickets.values()]
      .filter((ticket) => ticket.driverId === driverId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((ticket) => structuredClone(ticket));
  }

  async findById(
    id: string,
  ): Promise<DriverSupportTicketRecord | null> {
    const found = this.tickets.get(id);
    return found == null ? null : structuredClone(found);
  }

  async listRecent(limit: number): Promise<DriverSupportTicketRecord[]> {
    return [...this.tickets.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((ticket) => structuredClone(ticket));
  }

  async respond(input: {
    id: string;
    response: string;
    status: 'in_progress' | 'resolved' | 'closed';
    respondedAt: string;
  }): Promise<DriverSupportTicketRecord | null> {
    const found = this.tickets.get(input.id);
    if (found == null) return null;
    const updated: DriverSupportTicketRecord = {
      ...found,
      response: input.response,
      respondedAt: input.respondedAt,
      status: input.status,
      updatedAt: input.respondedAt,
    };
    this.tickets.set(input.id, updated);
    return structuredClone(updated);
  }
}
