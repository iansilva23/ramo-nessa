import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { quoteFare } from './pricing/quote-engine.js';
import { PricingError } from './pricing/types.js';
import { InvalidQuoteRequestError, parseQuoteRequest } from './pricing/validation.js';
import { PAYMENT_POLICY_V1 } from './payments/payment-policy.js';
import { resolvePassengerId, IdentityUnavailableError } from './auth/dev-identity.js';
import { createRide, RideCreationError } from './rides/create-ride.js';
import { createRepositories } from './db/repositories.js';
import { InvalidRideRequestError, parseCreateRideRequest } from './rides/validation.js';

const port = Number(process.env.PORT ?? 8080);
const { rideRepository, storageMode } = createRepositories();

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length === 0 ? {} : JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { ok: true, service: 'ramo-nessa-core', storageMode });
      return;
    }

    if (request.method === 'GET' && request.url === '/v1/payments/policy') {
      json(response, 200, PAYMENT_POLICY_V1);
      return;
    }

    if (request.method === 'POST' && request.url === '/v1/pricing/quote') {
      const body = parseQuoteRequest(await readJson(request));
      const quote = quoteFare(body);
      json(response, 200, quote);
      return;
    }

    if (request.method === 'POST' && request.url === '/v1/rides') {
      const passengerId = resolvePassengerId(request);
      const body = parseCreateRideRequest(await readJson(request));
      const ride = await createRide(rideRepository, {
        passengerId,
        quoteRequest: body.quoteRequest,
      });
      json(response, 201, ride);
      return;
    }

    json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    if (
      error instanceof InvalidQuoteRequestError ||
      error instanceof InvalidRideRequestError
    ) {
      json(response, 400, { error: 'INVALID_REQUEST', message: error.message });
      return;
    }

    if (error instanceof IdentityUnavailableError) {
      json(response, 503, {
        error: 'AUTH_NOT_CONFIGURED',
        message: error.message,
      });
      return;
    }

    if (error instanceof RideCreationError) {
      json(response, 422, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof PricingError) {
      json(response, 422, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof SyntaxError) {
      json(response, 400, { error: 'INVALID_JSON' });
      return;
    }

    json(response, 500, { error: 'INTERNAL_ERROR' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Ramo Nessa Core listening on :${port}`);
});
