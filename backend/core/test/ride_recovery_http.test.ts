import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { authenticateBearer, AuthenticationError, issueAuthSession } from '../src/auth/auth-service.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { authenticateAdminBearer, AdminAuthenticationError, issueAdminApiKey } from '../src/admin/admin-auth.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { readJsonBody } from '../src/http/request-body.js';
import { boardingRoutes } from '../src/rides/boarding-routes.js';
import { createRide } from '../src/rides/create-ride.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';

test('recovery HTTP authenticates real sessions, isolates accounts and never creates a second payment', async () => {
  const rides = new InMemoryRideRepository(), finance = new InMemoryFinanceRepository();
  const identities = new InMemoryAuthOtpRepository(), sessions = new InMemoryAuthSessionRepository(), admin = new InMemoryAdminRepository();
  async function account(subjectType: 'passenger' | 'driver', phoneE164: string) {
    const subjectId = randomUUID(), instant = new Date().toISOString();
    await identities.createIdentity({ id: subjectId, subjectId, subjectType, phoneE164, status: 'active', createdAt: instant, updatedAt: instant });
    return { subjectId, ...await issueAuthSession({ repository: sessions, subjectId, subjectType }) };
  }
  const passenger = await account('passenger', '+5588999990031'), other = await account('passenger', '+5588999990032');
  const driver = await account('driver', '+5588999990033');
  const reader = await issueAdminApiKey({ repository: admin, name: 'Boarding reader', scopes: ['rides:read'] });
  const writer = await issueAdminApiKey({ repository: admin, name: 'Boarding writer', scopes: ['rides:read', 'rides:write'] });
  const ride = await createRide(rides, { passengerId: passenger.subjectId, quoteRequest: { origin: { zoneId: 'prea' }, destination: { zoneId: 'jericoacoara' }, category: 'comfort_black', period: 'day' } });
  await rides.save({ ...ride, state: 'AWAITING_PAYMENT', driverId: driver.subjectId });
  const payment = await finance.createPayment({ id: randomUUID(), rideId: ride.id, method: 'pix', processor: 'test-orders', status: 'pending', amountCents: ride.quote.totalAmountCents, idempotencyKey: 'http-existing-payment', createdAt: ride.createdAt, updatedAt: ride.updatedAt });
  finance.createPayment = async () => { throw new Error('Recovery attempted to create a charge'); };
  const server = createServer(async (request, response) => {
    const json = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    const subject = async (requiredType: 'passenger' | 'driver') => (await authenticateBearer({ repository: sessions, identities, headers: request.headers, requiredType })).subjectId;
    try {
      if (!await boardingRoutes({ url: new URL(request.url!, 'http://localhost'), method: request.method!, store: null, rides, finance,
        passenger: () => subject('passenger'), driver: () => subject('driver'),
        authorize: async requiredScope => {
          const key = await authenticateAdminBearer({ repository: admin, headers: request.headers, requiredScope });
          return { kind: 'api_key', id: key.id, name: key.name };
        }, body: () => readJsonBody(request), json })) json(404, {});
    } catch (error) {
      if (error instanceof AuthenticationError) json(401, { error: error.code });
      else if (error instanceof AdminAuthenticationError) json(error.code === 'ADMIN_SCOPE_REQUIRED' ? 403 : 401, { error: error.code });
      else json(500, { error: 'UNEXPECTED_TEST_ERROR' });
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const call = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(origin + path, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await call('/v1/passenger/me/ride')).status, 401);
    assert.equal((await call('/v1/passenger/me/ride', driver.token)).status, 401);
    for (let i = 0; i < 4; i++) {
      const response = await call('/v1/passenger/me/ride', passenger.token);
      assert.equal(response.status, 200);
      const result = await response.json() as { ride: { id: string }; payment: { id: string; status: string } };
      assert.equal(result.ride.id, ride.id); assert.equal(result.payment.id, payment.id); assert.equal(result.payment.status, 'pending');
    }
    assert.deepEqual(await (await call('/v1/passenger/me/ride?lastRideId=' + ride.id, other.token)).json(), { ride: null });
    assert.equal((await call(`/v1/rides/${ride.id}/boarding`, other.token)).status, 404);
    assert.equal((await call(`/v1/rides/${ride.id}/boarding`, driver.token)).status, 401);
    assert.equal((await call(`/v1/driver/me/rides/${ride.id}/boarding`, passenger.token)).status, 401);
    assert.deepEqual(await (await call(`/v1/driver/me/rides/${ride.id}/boarding`, driver.token)).json(), { required: false });
    const override = `/v1/admin/rides/${ride.id}/boarding-override`;
    assert.equal((await call(override, passenger.token, 'POST', { reason: 'Unauthorized request' })).status, 401);
    assert.equal((await call(override, reader.token, 'POST', { reason: 'Unauthorized request' })).status, 403);
    assert.equal((await call('/v1/admin/boarding-policy', reader.token, 'PUT', {})).status, 403);
    assert.equal((await call('/v1/admin/boarding-policy', writer.token, 'PUT', {})).status, 503);
    assert.equal((await finance.findLatestPaymentByRideId(ride.id))?.id, payment.id);
    assert.equal((await rides.findById(ride.id))?.state, 'AWAITING_PAYMENT');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
