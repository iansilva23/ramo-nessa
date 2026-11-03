import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { createRide } from '../src/rides/create-ride.js';
import { readJsonBody } from '../src/http/request-body.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { passengerWhatsApp, rideChatRoutes } from '../src/rides/ride-chat-routes.js';

test('chat HTTP: unread receipts, concurrent arrival, pagination and contact privacy', async () => {
  const rides = new InMemoryRideRepository();
  const identities = new InMemoryAuthOtpRepository();
  const passengerId = randomUUID(), driverId = randomUUID();
  await identities.createIdentity({ id: passengerId, subjectId: passengerId, subjectType: 'passenger',
    phoneE164: '+5588999990001', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const ride = await createRide(rides, { passengerId,
    quoteRequest: {origin: {zoneId: 'prea'}, destination: {zoneId: 'jericoacoara'}, category: 'comfort_black', period: 'day'} });
  ride.state = 'DRIVER_ASSIGNED'; ride.driverId = driverId; await rides.save(ride);
  const other = await createRide(rides, { passengerId: randomUUID(),
    quoteRequest: {origin: {zoneId: 'prea'}, destination: {zoneId: 'jericoacoara'}, category: 'comfort_black', period: 'day'} });
  const foreign = await rides.appendChatMessage({ id: randomUUID(), rideId: other.id, senderType: 'passenger', senderId: other.passengerId, body: 'private', createdAt: new Date().toISOString() });
  const events: unknown[] = [];
  const server = createServer(async (request, response) => {
    const json = (r: typeof response, status: number, body: unknown) => { r.writeHead(status, {'content-type': 'application/json'}); r.end(JSON.stringify(body)); };
    try {
      const handled = await rideChatRoutes({request, response, url: new URL(request.url!, 'http://localhost'), rides, identities,
        authenticate: async role => {
          if (!request.headers.authorization) throw new Error('unauthorized');
          return request.headers.authorization === 'outsider' ? 'outsider' : role === 'driver' ? driverId : passengerId;
        }, readJson: readJsonBody, json, publish: message => events.push(message)});
      if (!handled) json(response, 404, {});
    } catch { json(response, 401, {}); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port;
  const driver = `/v1/driver/me/rides/${ride.id}/messages`, passenger = `/v1/rides/${ride.id}/messages`;
  const req = async (path: string, method = 'GET', body?: unknown, token: string | null = 'owner') =>
    fetch(base + path, { method, headers: {'content-type': 'application/json', ...(token ? {authorization: token} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
  const data = async (path: string) => (await (await req(path)).json()) as Record<string, any>;
  try {
    assert.equal((await req(driver + '/status', 'GET', undefined, null)).status, 401);
    assert.equal((await req(driver + '/status', 'GET', undefined, 'outsider')).status, 404);
    assert.equal((await req(passenger + '/status', 'GET', undefined, 'outsider')).status, 404);
    assert.equal((await data(driver + '/status')).passengerWhatsApp, '+5588999990001');
    assert.ok(!('passengerWhatsApp' in await data(passenger + '/status')));
    assert.equal((await data(driver + '/status')).unreadCount, 0);
    const one = await (await req(passenger, 'POST', {body: 'Cheguei'})).json() as any;
    assert.equal((await data(driver + '/status')).unreadCount, 1);
    assert.equal((await data(passenger + '/status')).unreadCount, 0);
    await data(driver); // Fetching does not imply reading.
    assert.equal((await data(driver + '/status')).unreadCount, 1);
    const two = await (await req(passenger, 'POST', {body: 'Estou no portão'})).json() as any;
    await req(driver + '/read', 'POST', {messageIds: [one.message.id, foreign.id]});
    assert.equal((await data(driver + '/status')).unreadCount, 1);
    await req(driver + '/read', 'POST', {messageIds: [one.message.id]});
    assert.equal((await data(driver + '/status')).unreadCount, 1);
    assert.equal(await rides.countUnreadChatMessages(other.id, 'driver', driverId), 1);
    await req(driver + '/read', 'POST', {messageIds: [two.message.id]});
    assert.equal((await data(driver + '/status')).unreadCount, 0);
    await req(driver, 'POST', {body: 'Estou a caminho'});
    assert.equal((await data(passenger + '/status')).unreadCount, 1);
    assert.equal((await data(driver + '/status')).unreadCount, 0);
    assert.equal((await req(driver + '/read', 'POST', {messageIds: ['invalid']})).status, 400);
    assert.equal((await req(driver + '/read', 'POST', {messageIds: Array(101).fill(one.message.id)})).status, 400);
    assert.equal((await req(driver + '?before=invalid')).status, 400);
    assert.equal((await req(passenger, 'POST', {body: ' '})).status, 400);
    // More than one page never loses older unread messages.
    for (let i = 0; i < 105; i++) await rides.appendChatMessage({id: randomUUID(), rideId: ride.id,
      senderType: 'passenger', senderId: passengerId, body: String(i), createdAt: new Date(Date.now() + i + 1000).toISOString()});
    const recent = (await data(driver)).messages;
    assert.equal(recent.length, 100);
    const earlier = (await data(driver + '?before=' + recent[0].id)).messages;
    assert.equal(earlier.length, 8);
    assert.equal(new Set([...recent, ...earlier].map(m => m.id)).size, 108);
    ride.state = 'COMPLETED'; await rides.save(ride);
    assert.equal((await data(driver + '/status')).passengerWhatsApp, null);
    assert.equal((await req(driver, 'POST', {body: 'late'})).status, 409);
    assert.equal((await req(driver)).status, 200);
    ride.state = 'CANCELLED_BY_PASSENGER'; await rides.save(ride);
    assert.equal((await req(driver + '/status')).status, 404);
    assert.ok(events.length >= 3);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('WhatsApp reuses a valid login mobile; missing/invalid phones never become contacts', () => {
  assert.equal(passengerWhatsApp(undefined), null);
  assert.equal(passengerWhatsApp(''), null);
  assert.equal(passengerWhatsApp('not-a-phone'), null);
  assert.equal(passengerWhatsApp('+5588999990001'), '+5588999990001');
});

test('PostgreSQL persists per-recipient receipts and paginates equal timestamps', {
  skip: process.env.RAMO_CHAT_TEST_POSTGRES !== 'true',
}, async () => {
  // Opt-in disposable CI database only; this test never connects to a VPS.
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/ramonessa');
  const { Pool } = await import('pg');
  const { PostgresRideRepository } = await import('../src/rides/repositories/postgres-ride-repository.js');
  const pool = new Pool({connectionString: url.toString(), max: 1});
  const rides = new PostgresRideRepository(pool);
  await pool.query('BEGIN');
  try {
    const passengerId = randomUUID(), driverId = randomUUID();
    const ride = await createRide(rides, {passengerId, quoteRequest: {origin: {zoneId: 'prea'},
      destination: {zoneId: 'jericoacoara'}, category: 'comfort_black', period: 'day'}});
    const messages = [];
    for (let i = 0; i < 105; i++) messages.push(await rides.appendChatMessage({id: randomUUID(), rideId: ride.id,
      senderType: 'passenger', senderId: passengerId, body: String(i), createdAt: '2026-10-23T12:00:00.000Z'}));
    assert.equal(await rides.countUnreadChatMessages(ride.id, 'driver', driverId), 105);
    assert.equal(await rides.countUnreadChatMessages(ride.id, 'passenger', passengerId), 0);
    const recent = await rides.listChatMessages(ride.id, 100);
    const earlier = await rides.listChatMessages(ride.id, 100, recent[0]!.id);
    assert.equal(recent.length, 100); assert.equal(earlier.length, 5);
    assert.equal(new Set([...recent, ...earlier].map(m => m.id)).size, 105);
    await rides.markChatMessagesRead(ride.id, 'driver', driverId, recent.map(m => m.id));
    await rides.markChatMessagesRead(ride.id, 'driver', driverId, recent.map(m => m.id));
    assert.equal(await new PostgresRideRepository(pool).countUnreadChatMessages(ride.id, 'driver', driverId), 5);
    assert.equal(await rides.countUnreadChatMessages(ride.id, 'driver', 'another-driver'), 105);
    await rides.markChatMessagesRead(ride.id, 'driver', driverId, earlier.map(m => m.id));
    assert.equal(await rides.countUnreadChatMessages(ride.id, 'driver', driverId), 0);
  } finally { await pool.query('ROLLBACK'); await pool.end(); }
});
