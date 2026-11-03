import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { AuthenticationError, issueAuthSession } from '../src/auth/auth-service.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { createDriverOffer } from '../src/matching/offer-service.js';
import { RealtimeHub } from '../src/realtime/realtime-hub.js';
import { attachRealtimeServer } from '../src/realtime/realtime-server.js';
import { BROWSER_REALTIME_PROTOCOL, BrowserRealtimeTicketStore } from '../src/realtime/browser-realtime-ticket.js';
import { issueBrowserRealtimeTicket } from '../src/realtime/browser-realtime-ticket-route.js';
import { HttpRequestBodyError } from '../src/http/request-body.js';

async function fixture(t: test.TestContext) {
  const sessions = new InMemoryAuthSessionRepository();
  const identities = new InMemoryAuthOtpRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const rides = new InMemoryRideRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const tickets = new BrowserRealtimeTicketStore();
  const hub = new RealtimeHub();
  const now = new Date();
  const instant = now.toISOString();
  const passenger = await issueAuthSession({ repository: sessions, subjectType: 'passenger', subjectId: 'passenger-browser' });
  const driver = await issueAuthSession({ repository: sessions, subjectType: 'driver', subjectId: 'driver-browser' });
  await registry.upsertProfile({ driverId: 'driver-browser', fullName: 'Motorista Teste', status: 'approved', createdAt: instant, updatedAt: instant });
  await registry.upsertVehicle({ id: 'vehicle-browser', driverId: 'driver-browser', plateNormalized: 'ABC1D23', make: 'Toyota',
    model: 'Teste', modelYear: 2024, color: 'Preta', categories: ['car'], fourByFour: false, seatCapacity: 4,
    status: 'approved', createdAt: instant, updatedAt: instant });
  const supply = await drivers.upsert({ driverId: 'driver-browser', vehicleId: 'vehicle-browser', categories: ['car'],
    fourByFour: false, seatCapacity: 4, online: true, busy: false, latitude: -2.8, longitude: -40.4,
    locationUpdatedAt: instant, updatedAt: instant });
  await rides.create({ id: 'ride-browser', passengerId: 'passenger-browser', state: 'SEARCHING_DRIVER', paymentStatus: 'pending',
    origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car', period: 'day', passengers: 1,
    quote: { ruleId: 'fixture', baseAmountCents: 10000, pickupCompensationCents: 0, totalAmountCents: 10000,
      platformCommissionCents: 1000, driverNetCents: 9000 }, createdAt: instant, updatedAt: instant });
  const offered = await createDriverOffer({ repository: matching, rideId: 'ride-browser',
    driver: { supply, approximatePickupDistanceKm: 1, routeDistanceRequiredForFinalFare: true }, now });
  const offer = offered.offer;
  const server = createServer(async (request, response) => {
    try {
      const result = await issueBrowserRealtimeTicket({ request, sessions, identities, drivers, registry, rides, tickets });
      response.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(error instanceof AuthenticationError ? 401 : error instanceof HttpRequestBodyError ? 413 : 400);
      response.end('{}');
    }
  });
  const realtime = attachRealtimeServer({ server, sessions, identities, drivers, registry, rides, matching, hub, browserTickets: tickets });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    realtime.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const issue = (token: string, role: string, rideId?: string, requestOrigin = origin) => fetch(origin + '/v1/realtime/ticket', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ role, ...(rideId == null ? {} : { rideId }) }),
  });
  const connect = (role: string, ticket?: string, rideId?: string, socketOrigin = origin, token?: string) => {
    const uri = origin.replace('http:', 'ws:') + '/v1/realtime/' + role + (rideId == null ? '' : '?rideId=' + rideId);
    const ws = new WebSocket(uri, ticket == null ? [] : [BROWSER_REALTIME_PROTOCOL, 'ticket.' + ticket], {
      headers: ticket == null ? { ...(token == null ? {} : { authorization: `Bearer ${token}` }) } : { origin: socketOrigin },
    });
    sockets.push(ws);
    return ws;
  };
  return { origin, issue, connect, passenger, driver, sessions, hub, offer, realtime, tickets };
}

async function rejected(ws: WebSocket) {
  const [error] = await once(ws, 'error');
  assert.match(String(error), /Unexpected server response: (401|400)/);
}

test('HTTP ticket and real browser socket deliver private ride updates, replay is rejected, native bearer still works', async t => {
  const f = await fixture(t);
  const response = await f.issue(f.passenger.token, 'passenger', 'ride-browser');
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { ticket } = await response.json() as { ticket: string };
  const ws = f.connect('passenger', ticket, 'ride-browser');
  const firstMessage = once(ws, 'message');
  await once(ws, 'open');
  assert.equal(ws.protocol, BROWSER_REALTIME_PROTOCOL);
  assert.ok(!ws.url.includes(ticket) && !ws.url.includes(f.passenger.token));
  assert.equal(JSON.parse(String((await firstMessage)[0])).tracking.ride.id, 'ride-browser');
  const update = once(ws, 'message');
  assert.equal(f.hub.publishPassengerRide('ride-other', { type: 'other' }), 0);
  f.hub.publishPassengerRide('ride-browser', { type: 'passenger.ride.tracking', tracking: { ride: { id: 'ride-browser', state: 'IN_PROGRESS' } } });
  assert.equal(JSON.parse(String((await update)[0])).tracking.ride.state, 'IN_PROGRESS');
  await rejected(f.connect('passenger', ticket, 'ride-browser'));
  const native = f.connect('passenger', undefined, 'ride-browser', undefined, f.passenger.token);
  const nativeMessage = once(native, 'message');
  await once(native, 'open');
  assert.equal(JSON.parse(String((await nativeMessage)[0])).tracking.ride.id, 'ride-browser');
  const closed = once(ws, 'close');
  await f.sessions.revoke(f.passenger.session.id, new Date().toISOString());
  f.realtime.disconnectBrowserSession(f.passenger.session.id);
  assert.equal((await closed)[0], 4401);
});

test('driver browser gets existing 35-second offer and realtime updates', async t => {
  const f = await fixture(t);
  const response = await f.issue(f.driver.token, 'driver');
  assert.equal(response.status, 201);
  const { ticket } = await response.json() as { ticket: string };
  const ws = f.connect('driver', ticket);
  const bootstrap = once(ws, 'message');
  await once(ws, 'open');
  const event = JSON.parse(String((await bootstrap)[0]));
  assert.equal(event.type, 'driver.bootstrap');
  assert.equal(event.offer.id, f.offer.id);
  assert.equal(Date.parse(event.offer.expiresAt) - Date.parse(f.offer.createdAt), 35_000);
  const update = once(ws, 'message');
  f.hub.publishDriver('driver-browser', { type: 'driver.ride.updated', ride: { state: 'AWAITING_PAYMENT' } });
  assert.equal(JSON.parse(String((await update)[0])).ride.state, 'AWAITING_PAYMENT');
});

test('HTTP rejects wrong account role, other ride, missing bearer, foreign origin and excessive body', async t => {
  const f = await fixture(t);
  assert.equal((await f.issue(f.passenger.token, 'driver')).status, 401);
  assert.equal((await f.issue(f.passenger.token, 'passenger', 'ride-other')).status, 403);
  assert.equal((await f.issue('', 'passenger', 'ride-browser')).status, 401);
  assert.equal((await f.issue(f.passenger.token, 'passenger', 'ride-browser', 'https://evil.example.com')).status, 401);
  assert.equal((await f.issue(f.driver.token, 'driver', 'ride-browser')).status, 400);
  const tooBig = await fetch(f.origin + '/v1/realtime/ticket', { method: 'POST', headers: {
    authorization: `Bearer ${f.passenger.token}`, origin: f.origin }, body: 'x'.repeat(1025) });
  assert.equal(tooBig.status, 413);
});

test('upgrade rejects cross-origin, wrong ride, role swap, expired ticket and logout between issue and upgrade', async t => {
  const f = await fixture(t);
  for (const scenario of ['origin', 'ride', 'role', 'expiry', 'logout'] as const) {
    const ticket = f.tickets.issue(f.passenger.session, f.origin, 'ride-browser',
      scenario === 'expiry' ? Date.now() - 15_001 : Date.now()).ticket;
    if (scenario === 'logout') await f.sessions.revoke(f.passenger.session.id, new Date().toISOString());
    await rejected(f.connect(scenario === 'role' ? 'driver' : 'passenger', ticket,
      scenario === 'ride' ? 'ride-other' : 'ride-browser', scenario === 'origin' ? 'http://evil.example.com' : f.origin));
  }
});
