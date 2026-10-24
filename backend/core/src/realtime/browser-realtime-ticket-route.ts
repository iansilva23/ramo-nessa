import type { IncomingMessage } from 'node:http';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import { authenticateBearer } from '../auth/auth-service.js';
import { getDriverSupplyForApp } from '../drivers/driver-app-service.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import { readJsonBody } from '../http/request-body.js';
import { BrowserRealtimeTicketStore, browserRealtimeOrigin } from './browser-realtime-ticket.js';

export async function issueBrowserRealtimeTicket(input: {
  request: IncomingMessage;
  sessions: AuthSessionRepository;
  identities: AuthOtpRepository;
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  rides: RideRepository;
  tickets: BrowserRealtimeTicketStore;
}): Promise<{ status: number; body: unknown }> {
  const origin = browserRealtimeOrigin(input.request);
  const body = await readJsonBody(input.request, 1024) as { role?: unknown; rideId?: unknown } | null;
  const role = body?.role;
  if (role !== 'driver' && role !== 'passenger') {
    return { status: 400, body: { error: 'INVALID_REALTIME_ROLE' } };
  }
  const session = await authenticateBearer({
    repository: input.sessions, identities: input.identities,
    headers: input.request.headers, requiredType: role,
  });
  let rideId: string | null = null;
  if (role === 'driver') {
    if (body?.rideId != null) {
      return { status: 400, body: { error: 'INVALID_REALTIME_SCOPE' } };
    }
    await getDriverSupplyForApp({ drivers: input.drivers,
      registry: input.registry, driverId: session.subjectId });
  } else {
    rideId = typeof body?.rideId === 'string' ? body.rideId.trim() : null;
    const ride = rideId == null ? null : await input.rides.findById(rideId);
    if (ride == null || ride.passengerId !== session.subjectId) {
      return { status: 403, body: { error: 'RIDE_NOT_AUTHORIZED' } };
    }
  }
  return { status: 201, body: input.tickets.issue(session, origin, rideId) };
}
