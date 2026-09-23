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

export interface RealtimeServerHandle {
  close(): void;
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
  });
  const heartbeatState = new Map<WebSocket, boolean>();
  let closed = false;

  const registerHeartbeat = (ws: WebSocket) => {
    heartbeatState.set(ws, true);
    ws.on('pong', () => heartbeatState.set(ws, true));
    const cleanupHeartbeat = () => heartbeatState.delete(ws);
    ws.once('close', cleanupHeartbeat);
    ws.once('error', cleanupHeartbeat);
  };

  const heartbeatTimer = setInterval(() => {
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

    const requestUrl = new URL(
      request.url ?? '/',
      'http://ramo-nossa.local',
    );

    try {
      if (requestUrl.pathname === '/v1/realtime/driver') {
        const driverId = await resolveDriverId({
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
        const passengerId = await resolvePassengerId({
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
          const unsubscribe =
            input.hub.subscribePassengerRide(rideId, ws);
          const cleanup = () => unsubscribe();
          ws.once('close', cleanup);
          ws.once('error', cleanup);

          void passengerRideTracking({
            rides: input.rides,
            drivers: input.drivers,
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

  return { close: closeRealtime };
}
