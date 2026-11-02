import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import { normalizeBrazilMobilePhone } from '../auth/phone-otp-service.js';
import type { RideChatMessageRecord, RideRepository } from './ride-repository.js';

const activeStates = new Set(['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS']);
const readableStates = new Set([...activeStates, 'COMPLETED']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function passengerWhatsApp(phone: string | undefined): string | null {
  if (phone == null) return null;
  try { return normalizeBrazilMobilePhone(phone); } catch { return null; }
}

export async function rideChatRoutes(input: {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  rides: RideRepository;
  identities: AuthOtpRepository;
  authenticate: (role: 'driver' | 'passenger') => Promise<string>;
  readJson: (request: IncomingMessage) => Promise<unknown>;
  json: (response: ServerResponse, status: number, body: unknown) => void;
  publish: (message: RideChatMessageRecord, driverId: string) => void;
}): Promise<boolean> {
  const { request, response, url, rides, identities, json } = input;
  const match = url.pathname.match(/^\/v1\/(driver\/me\/)?rides\/([0-9a-f-]+)\/messages(?:\/(status|read))?$/i);
  if (match == null) return false;
  const role = match[1] ? 'driver' : 'passenger';
  const action = match[3];
  if (!((request.method === 'GET' && action !== 'read') ||
        (request.method === 'POST' && action !== 'status'))) {
    json(response, 405, { error: 'METHOD_NOT_ALLOWED' }); return true;
  }
  const subjectId = await input.authenticate(role);
  const rideId = match[2]!;
  const ride = uuid.test(rideId) ? await rides.findById(rideId) : null;
  if (ride == null || (role === 'driver' ? ride.driverId : ride.passengerId) !== subjectId ||
      !readableStates.has(ride.state)) {
    json(response, 404, { error: 'RIDE_CHAT_NOT_AVAILABLE' }); return true;
  }
  if (action === 'status') {
    // Phone is deliberately absent from offer, ride history and realtime payloads.
    const identity = role === 'driver' && activeStates.has(ride.state)
      ? await identities.findIdentityBySubject('passenger', ride.passengerId) : null;
    json(response, 200, {
      unreadCount: await rides.countUnreadChatMessages(rideId, role, subjectId),
      ...(role === 'driver' ? { passengerWhatsApp: passengerWhatsApp(identity?.phoneE164) } : {}),
    });
    return true;
  }
  if (request.method === 'GET') {
    const before = url.searchParams.get('before');
    if (before != null && !uuid.test(before)) {
      json(response, 400, { error: 'INVALID_CHAT_CURSOR' }); return true;
    }
    json(response, 200, { messages: await rides.listChatMessages(rideId, 100, before ?? undefined) });
    return true;
  }
  const body = await input.readJson(request);
  const record = body != null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  if (action === 'read') {
    const ids = record.messageIds;
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every(id => typeof id === 'string' && uuid.test(id))) {
      json(response, 400, { error: 'INVALID_CHAT_READ' }); return true;
    }
    // Acknowledge only the messages actually rendered; a concurrent arrival stays unread.
    await rides.markChatMessagesRead(rideId, role, subjectId, ids);
    json(response, 200, { unreadCount: await rides.countUnreadChatMessages(rideId, role, subjectId) });
    return true;
  }
  if (!activeStates.has(ride.state) || ride.driverId == null) {
    json(response, 409, { error: 'RIDE_CHAT_NOT_ACTIVE', message: 'O chat fica disponível enquanto a corrida está ativa.' });
    return true;
  }
  const text = typeof record.body === 'string' ? record.body.trim() : '';
  if (text.length < 1 || text.length > 1000) {
    json(response, 400, { error: 'INVALID_RIDE_CHAT_MESSAGE', message: 'Mensagem deve ter entre 1 e 1000 caracteres.' });
    return true;
  }
  const message = await rides.appendChatMessage({ id: randomUUID(), rideId, senderType: role,
    senderId: subjectId, body: text, createdAt: new Date().toISOString() });
  input.publish(message, ride.driverId);
  json(response, 201, { message });
  return true;
}
