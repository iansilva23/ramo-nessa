import { rideSupportContext, type RideSupportDependencies } from '../rides/ride-support-context.js';
import { randomUUID } from 'node:crypto';

import type {
  DriverSupportCategory,
  DriverSupportCursor,
  DriverSupportRepository,
  DriverSupportStatus,
  DriverSupportTicketRecord,
} from './driver-support-repository.js';

export class DriverSupportError extends Error {
  constructor(
    public readonly code:
      | 'SUPPORT_RIDE_UNAVAILABLE'
      | 'INVALID_SUPPORT_CATEGORY'
      | 'INVALID_SUPPORT_SUBJECT'
      | 'INVALID_SUPPORT_MESSAGE'
      | 'INVALID_SUPPORT_RESPONSE'
      | 'SUPPORT_TICKET_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DriverSupportError';
  }
}

const CATEGORIES = new Set<DriverSupportCategory>([
  'ride',
  'payment',
  'account',
  'document',
  'other',
]);

function cleanText(
  value: unknown,
  min: number,
  max: number,
  code: DriverSupportError['code'],
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new DriverSupportError(code, label + ' é obrigatório.');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new DriverSupportError(
      code,
      label + ' deve ter entre ' + min + ' e ' + max + ' caracteres.',
    );
  }
  return normalized;
}

export function supportTicketView(
  ticket: DriverSupportTicketRecord,
) {
  return {
    id: ticket.id,
    ...(ticket.rideId == null ? {} : {rideId: ticket.rideId}),
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    ...(ticket.response == null
      ? {}
      : { response: ticket.response }),
    ...(ticket.respondedAt == null
      ? {}
      : { respondedAt: ticket.respondedAt }),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export async function createDriverSupportTicket(input: {
  repository: DriverSupportRepository;
  driverId: string;
  category: unknown;
  subject: unknown;
  message: unknown;
  now?: Date;
  rideId?: unknown;
  rideDependencies?: RideSupportDependencies;
}) {
  const category =
    typeof input.category === 'string'
      ? input.category.trim()
      : '';
  if (!CATEGORIES.has(category as DriverSupportCategory)) {
    throw new DriverSupportError(
      'INVALID_SUPPORT_CATEGORY',
      'Categoria de suporte inválida.',
    );
  }

  const now = input.now ?? new Date();
  const instant = now.toISOString();
  if (input.rideId != null && input.rideDependencies == null) throw new DriverSupportError('SUPPORT_RIDE_UNAVAILABLE', 'Corrida indisponível para este atendimento.');
  const context = input.rideDependencies == null ? undefined : await rideSupportContext({...input.rideDependencies, rideId: input.rideId, requesterType: 'driver', requesterId: input.driverId, ...(input.now == null ? {} : {now: input.now})});
  const ticket: DriverSupportTicketRecord = {
    id: randomUUID(),
    requesterType: 'driver',
    ...(context == null ? {} : {rideId: context.rideId, rideContext: context}),
    driverId: input.driverId,
    category: category as DriverSupportCategory,
    subject: cleanText(
      input.subject,
      3,
      120,
      'INVALID_SUPPORT_SUBJECT',
      'Assunto',
    ),
    message: cleanText(
      input.message,
      10,
      2000,
      'INVALID_SUPPORT_MESSAGE',
      'Mensagem',
    ),
    status: 'open',
    createdAt: instant,
    updatedAt: instant,
  };

  return supportTicketView(await input.repository.create(ticket));
}

export async function createPassengerSupportTicket(input: {
  repository: DriverSupportRepository;
  passengerId: string;
  category: unknown;
  subject: unknown;
  message: unknown;
  now?: Date;
  rideId?: unknown;
  rideDependencies?: RideSupportDependencies;
}) {
  const category =
    typeof input.category === 'string' ? input.category.trim() : '';
  if (
    !CATEGORIES.has(category as DriverSupportCategory) ||
    category === 'document'
  ) {
    throw new DriverSupportError(
      'INVALID_SUPPORT_CATEGORY',
      'Categoria de suporte inválida.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  if (input.rideId != null && input.rideDependencies == null) throw new DriverSupportError('SUPPORT_RIDE_UNAVAILABLE', 'Corrida indisponível para este atendimento.');
  const context = input.rideDependencies == null ? undefined : await rideSupportContext({...input.rideDependencies, rideId: input.rideId, requesterType: 'passenger', requesterId: input.passengerId, ...(input.now == null ? {} : {now: input.now})});
  const ticket: DriverSupportTicketRecord = {
    id: randomUUID(),
    requesterType: 'passenger',
    ...(context == null ? {} : {rideId: context.rideId, rideContext: context}),
    passengerId: input.passengerId,
    category: category as DriverSupportCategory,
    subject: cleanText(
      input.subject,
      3,
      120,
      'INVALID_SUPPORT_SUBJECT',
      'Assunto',
    ),
    message: cleanText(
      input.message,
      10,
      2000,
      'INVALID_SUPPORT_MESSAGE',
      'Mensagem',
    ),
    status: 'open',
    createdAt: instant,
    updatedAt: instant,
  };

  return supportTicketView(await input.repository.create(ticket));
}

export async function listPassengerSupportTickets(input: {
  repository: DriverSupportRepository;
  passengerId: string;
  limit?: number;
  rideId?: string;
}) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 30));
  const tickets = await input.repository.listByPassenger(
    input.passengerId,
    limit,
    input.rideId,
  );
  return { tickets: tickets.map(supportTicketView) };
}

export async function listDriverSupportTickets(input: {
  repository: DriverSupportRepository;
  driverId: string;
  limit?: number;
  rideId?: string;
}) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 30));
  const tickets = await input.repository.listByDriver(
    input.driverId,
    limit,
    input.rideId,
  );
  return {
    tickets: tickets.map(supportTicketView),
  };
}

export async function listSupportTicketsForAdmin(input: {
  repository: DriverSupportRepository;
  status?: DriverSupportStatus;
  limit?: number;
  cursor?: DriverSupportCursor;
}) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const page = await input.repository.listAdmin({
    limit,
    ...(input.status == null ? {} : { status: input.status }),
    ...(input.cursor == null ? {} : { cursor: input.cursor }),
  });
  const last = page.tickets[page.tickets.length - 1];
  return {
    tickets: page.tickets.map((ticket) => ({
      requesterType: ticket.requesterType,
      requesterId:
        ticket.requesterType === 'driver'
          ? ticket.driverId
          : ticket.passengerId,
      driverId:
        ticket.requesterType === 'driver' ? ticket.driverId : null,
      passengerId:
        ticket.requesterType === 'passenger'
          ? ticket.passengerId
          : null,
      ...supportTicketView(ticket),
      ...(ticket.rideContext == null ? {} : {rideContext: ticket.rideContext}),
    })),
    nextCursor:
      page.hasMore && last != null
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

export async function respondToSupportTicket(input: {
  repository: DriverSupportRepository;
  id: string;
  response: unknown;
  status: unknown;
  now?: Date;
}) {
  const response = cleanText(
    input.response,
    3,
    2000,
    'INVALID_SUPPORT_RESPONSE',
    'Resposta',
  );
  const status = input.status;
  if (
    status !== 'in_progress' &&
    status !== 'resolved' &&
    status !== 'closed'
  ) {
    throw new DriverSupportError(
      'INVALID_SUPPORT_RESPONSE',
      'Status da resposta é inválido.',
    );
  }

  const updated = await input.repository.respond({
    id: input.id,
    response,
    status: status as Exclude<DriverSupportStatus, 'open'>,
    respondedAt: (input.now ?? new Date()).toISOString(),
  });
  if (updated == null) {
    throw new DriverSupportError(
      'SUPPORT_TICKET_NOT_FOUND',
      'Chamado de suporte não encontrado.',
    );
  }
  return {
    requesterType: updated.requesterType,
    requesterId:
      updated.requesterType === 'driver'
        ? updated.driverId
        : updated.passengerId,
    driverId:
      updated.requesterType === 'driver' ? updated.driverId : null,
    passengerId:
      updated.requesterType === 'passenger'
        ? updated.passengerId
        : null,
    ticket: {...supportTicketView(updated), ...(updated.rideContext == null ? {} : {rideContext: updated.rideContext})},
  };
}
