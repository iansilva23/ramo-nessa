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

interface SupportTicketBase {
  rideId?: string;
  rideContext?: import('../rides/ride-support-context.js').RideSupportContext;
  id: string;
  category: DriverSupportCategory;
  subject: string;
  message: string;
  status: DriverSupportStatus;
  response?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type DriverSupportTicketRecord = SupportTicketBase & (
  | { requesterType: 'driver'; driverId: string; passengerId?: never }
  | { requesterType: 'passenger'; passengerId: string; driverId?: never }
);

export interface DriverSupportCursor {
  createdAt: string;
  id: string;
}

export interface DriverSupportAdminListInput {
  status?: DriverSupportStatus;
  limit: number;
  cursor?: DriverSupportCursor;
}

export interface DriverSupportAdminListPage {
  tickets: DriverSupportTicketRecord[];
  hasMore: boolean;
}

export interface DriverSupportRepository {
  create(
    ticket: DriverSupportTicketRecord,
  ): Promise<DriverSupportTicketRecord>;
  listByDriver(
    driverId: string,
    limit: number,
    rideId?: string,
  ): Promise<DriverSupportTicketRecord[]>;
  listByPassenger(
    passengerId: string,
    limit: number,
    rideId?: string,
  ): Promise<DriverSupportTicketRecord[]>;
  findById(id: string): Promise<DriverSupportTicketRecord | null>;
  listAdmin(
    input: DriverSupportAdminListInput,
  ): Promise<DriverSupportAdminListPage>;
  respond(input: {
    id: string;
    response: string;
    status: 'in_progress' | 'resolved' | 'closed';
    respondedAt: string;
  }): Promise<DriverSupportTicketRecord | null>;
}
