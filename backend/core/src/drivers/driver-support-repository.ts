export type DriverSupportCategory =
  | 'ride'
  | 'payment'
  | 'account'
  | 'document'
  | 'other';

export type DriverSupportStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface DriverSupportTicketRecord {
  id: string;
  driverId: string;
  category: DriverSupportCategory;
  subject: string;
  message: string;
  status: DriverSupportStatus;
  response?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverSupportRepository {
  create(
    ticket: DriverSupportTicketRecord,
  ): Promise<DriverSupportTicketRecord>;
  listByDriver(
    driverId: string,
    limit: number,
  ): Promise<DriverSupportTicketRecord[]>;
  findById(id: string): Promise<DriverSupportTicketRecord | null>;
  listRecent(limit: number): Promise<DriverSupportTicketRecord[]>;
  respond(input: {
    id: string;
    response: string;
    status: 'in_progress' | 'resolved' | 'closed';
    respondedAt: string;
  }): Promise<DriverSupportTicketRecord | null>;
}
