import type { Server } from 'node:http';

import { WebSocketServer, type WebSocket } from 'ws';

import {
  resolveDriverId,
  resolvePassengerId,
} from '../auth/dev-identity.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import {
  currentDriverRide,
  driverRideView,
} from '../drivers/driver-ride-service.js';
import {
  driverOfferView,
  getDriverSupplyForApp,
} from '../drivers/driver-app-service.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import { passengerRideTracking } from '../rides/passenger-ride-tracking.js';
import { RealtimeHub } from './realtime-hub.js';
import {
  BROWSER_REALTIME_PROTOCOL,
  BrowserRealtimeTicketStore,
  browserRealtimeOrigin,
  validateBrowserRealtimeSession,
  type BrowserRealtimeGrant,
} from './browser-realtime-ticket.js';

export interface RealtimeServerHandle {
  close(): void;
  disconnectBrowserSession(sessionId: string): void;
}

interface AttachRealtimeServerInput {
  server: Server;
  hub: RealtimeHub;
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  matching: RideMatchingRepository;
  sessions: AuthSessionRepository;
  identities: AuthOtpRepository;
  browserTickets?: BrowserRealtimeTicketStore;
}

function rejectUpgrade(
  socket: import('node:stream').Duplex,
  status: number,
  message: string,
): void {
  const body = JSON.stringify({ error: message });
  socket.write(
    `HTTP/1.1 ${status} ${
      status === 401
        ? 'Unauthorized'
        : status === 503
          ? 'Service Unavailable'
          : 'Bad Request'
    }\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
  socket.destroy();
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function attachRealtimeServer(
  input: AttachRealtimeServerInput,
): RealtimeServerHandle {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
    handleProtocols: protocols => protocols.has(BROWSER_REALTIME_PROTOCOL)
      ? BROWSER_REALTIME_PROTOCOL : (protocols.values().next().value ?? false),
  });
  const heartbeatState = new Map<WebSocket, boolean>();
  const browserGrants = new Map<WebSocket, BrowserRealtimeGrant>();
  let closed = false;

  const registerHeartbeat = (ws: WebSocket) => {
    heartbeatState.set(ws, true);
    ws.on('pong', () => heartbeatState.set(ws, true));
    const cleanupHeartbeat = () => {
      heartbeatState.delete(ws);
      browserGrants.delete(ws);
    };
    ws.once('close', cleanupHeartbeat);
    ws.once('error', cleanupHeartbeat);
  };

  const heartbeatTimer = setInterval(() => {
    for (const [ws, grant] of browserGrants) {
      void validateBrowserRealtimeSession({ grant, sessions: input.sessions,
        identities: input.identities }).catch(() => ws.close(4401, 'session_ended'));
    }
    for (const ws of wss.clients) {
      if (heartbeatState.get(ws) === false) {
        ws.terminate();
        heartbeatState.delete(ws);
        continue;
      }
      if (ws.readyState === ws.OPEN) {
        heartbeatState.set(ws, false);
        ws.ping();
      }
    }
  }, 30_000);
  heartbeatTimer.unref();

  const closeRealtime = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    heartbeatState.clear();
    browserGrants.clear();

    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.close(1001, 'server_shutdown');
      } else {
        ws.terminate();
      }
    }
    wss.close();
  };

  input.server.once('close', closeRealtime);

  input.server.on('upgrade', async (request, socket, head) => {
    if (closed) {
      rejectUpgrade(socket, 503, 'server_shutting_down');
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? '/', 'http://ramo-nossa.local');
      // Neither Bearer nor ticket appears in query strings; only the fixed protocol is reflected.
      if ([...requestUrl.searchParams.keys()].some(key => key !== 'rideId')) {
        rejectUpgrade(socket, 400, 'invalid_realtime_query');
        return;
      }
      const protocols = (request.headers['sec-websocket-protocol'] ?? '')
        .split(',').map(value => value.trim());
      const browser = protocols.includes(BROWSER_REALTIME_PROTOCOL);
      let browserGrant: BrowserRealtimeGrant | null = null;
      if (request.headers.origin != null || browser) browserRealtimeOrigin(request);
      if (browser) {
        const ticketProtocols = protocols.filter(value => value.startsWith('ticket.'));
        const role = requestUrl.pathname === '/v1/realtime/driver' ? 'driver' :
          requestUrl.pathname === '/v1/realtime/passenger' ? 'passenger' : '';
        if (input.browserTickets == null || ticketProtocols.length !== 1 || protocols.length !== 2) {
          throw new Error('invalid_browser_protocol');
        }
        browserGrant = input.browserTickets.consume(ticketProtocols[0]!.slice(7),
          browserRealtimeOrigin(request), role, requestUrl.searchParams.get('rideId')?.trim() ?? null);
        await validateBrowserRealtimeSession({ grant: browserGrant,
          sessions: input.sessions, identities: input.identities });
      }
      const registerBrowserGrant = (ws: WebSocket) => {
        if (browserGrant != null) browserGrants.set(ws, browserGrant);
      };
      if (requestUrl.pathname === '/v1/realtime/driver') {
        const driverId = browserGrant?.session.subjectId ?? await resolveDriverId({
          request,
          sessions: input.sessions,
          identities: input.identities,
        });
        await getDriverSupplyForApp({
          drivers: input.drivers,
          registry: input.registry,
          driverId,
        });

        wss.handleUpgrade(request, socket, head, (ws) => {
          registerHeartbeat(ws);
          registerBrowserGrant(ws);
          const unsubscribe = input.hub.subscribeDriver(driverId, ws);
          const cleanup = () => unsubscribe();
          ws.once('close', cleanup);
          ws.once('error', cleanup);

          void (async () => {
            const offerRecord =
              await input.matching.findLatestOfferedForDriver(driverId);
            let offer = null;
            if (
              offerRecord != null &&
              offerRecord.status === 'OFFERED' &&
              Date.parse(offerRecord.expiresAt) > Date.now()
            ) {
              const ride = await input.rides.findById(offerRecord.rideId);
              if (ride != null) {
                offer = driverOfferView(offerRecord, ride);
              }
            }

            const ride = await currentDriverRide({
              rides: input.rides,
              drivers: input.drivers,
              driverId,
            });

            sendJson(ws, {
              type: 'driver.bootstrap',
              offer,
              ride,
              serverTime: new Date().toISOString(),
            });
          })().catch(() => {
            if (ws.readyState === ws.OPEN) {
              ws.close(1011, 'bootstrap_failed');
            }
          });
        });
        return;
      }

      if (requestUrl.pathname === '/v1/realtime/passenger') {
        const passengerId = browserGrant?.session.subjectId ?? await resolvePassengerId({
          request,
          sessions: input.sessions,
          identities: input.identities,
        });
        const rideId = requestUrl.searchParams.get('rideId')?.trim();
        if (rideId == null || rideId.length < 3) {
          rejectUpgrade(socket, 400, 'rideId_required');
          return;
        }

        const ride = await input.rides.findById(rideId);
        if (ride == null || ride.passengerId !== passengerId) {
          rejectUpgrade(socket, 401, 'ride_not_authorized');
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          registerHeartbeat(ws);
          registerBrowserGrant(ws);
          const unsubscribe =
            input.hub.subscribePassengerRide(rideId, ws);
          const cleanup = () => unsubscribe();
          ws.once('close', cleanup);
          ws.once('error', cleanup);

          void passengerRideTracking({
            rides: input.rides,
            drivers: input.drivers,
            registry: input.registry,
            rideId,
            passengerId,
          })
            .then((tracking) => {
              if (tracking != null) {
                sendJson(ws, {
                  type: 'passenger.ride.tracking',
                  tracking,
                  serverTime: new Date().toISOString(),
                });
              }
            })
            .catch(() => {
              if (ws.readyState === ws.OPEN) {
                ws.close(1011, 'bootstrap_failed');
              }
            });
        });
        return;
      }

      rejectUpgrade(socket, 400, 'unknown_realtime_endpoint');
    } catch {
      rejectUpgrade(socket, 401, 'realtime_auth_failed');
    }
  });

  return {
    close: closeRealtime,
    disconnectBrowserSession(sessionId) {
      for (const [ws, grant] of browserGrants) {
        if (grant.session.id === sessionId) ws.close(4401, 'session_ended');
      }
    },
  };
}
