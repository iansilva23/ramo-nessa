import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { quoteFare } from './pricing/quote-engine.js';
import { PricingError } from './pricing/types.js';
import { InvalidQuoteRequestError, parseQuoteRequest } from './pricing/validation.js';
import { PAYMENT_POLICY_V1 } from './payments/payment-policy.js';
import { createPaymentForRide } from './payments/create-payment.js';
import { PaymentDomainError } from './payments/payment.js';
import {
  InvalidPaymentRequestError,
  parseCreatePaymentRequest,
  readIdempotencyKey,
} from './payments/validation.js';
import {
  PaymentProcessorUnavailableError,
  resolvePaymentProcessor,
} from './payments/dev-processor.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from './payments/wallet-services.js';
import { WalletDomainError } from './payments/wallet.js';
import {
  InvalidWalletRequestError,
  parseCreateWalletTopupRequest,
} from './payments/wallet-validation.js';
import {
  resolveDriverId,
  resolvePassengerId,
  IdentityUnavailableError,
} from './auth/dev-identity.js';
import {
  acceptOfferFromDriverApp,
  currentDriverOffer,
  getDriverSupplyForApp,
  DriverAppError,
  rejectOfferFromDriverApp,
  updateDriverSupplyFromApp,
} from './drivers/driver-app-service.js';
import {
  InvalidDriverRequestError,
  parseUpdateDriverSupplyRequest,
} from './drivers/driver-validation.js';
import { DriverSupplyError } from './drivers/driver-supply.js';
import {
  currentDriverRide,
  performDriverRideAction,
} from './drivers/driver-ride-service.js';
import { RideOfferError } from './matching/ride-offer.js';
import { createRide, RideCreationError } from './rides/create-ride.js';
import { createRepositories } from './db/repositories.js';
import {
  InvalidRideRequestError,
  parseCreateRideRequest,
  parsePrepareRideRequest,
} from './rides/validation.js';
import {
  prepareRideForPayment,
  RidePreparationError,
} from './rides/prepare-ride.js';
import { createRoutingDistanceProviderFromEnv } from './routing/osrm-distance-provider.js';
import {
  confirmRidePayment,
  RidePaymentConfirmationError,
} from './rides/confirm-payment.js';
import { dispatchRideAfterPayment } from './rides/dispatch-after-payment.js';

const port = Number(process.env.PORT ?? 8080);
const {
  rideRepository,
  financeRepository,
  driverSupplyRepository,
  ridePreparationRepository,
  rideMatchingRepository,
  storageMode,
} = createRepositories();
const routingDistanceProvider = createRoutingDistanceProviderFromEnv();

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
    const requestUrl = new URL(request.url ?? '/', 'http://ramo-nossa.local');
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { ok: true, service: 'ramo-nessa-core', storageMode });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/supply'
    ) {
      const driverId = resolveDriverId(request);
      const supply = await getDriverSupplyForApp({
        drivers: driverSupplyRepository,
        driverId,
      });
      json(response, 200, supply);
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/driver/me/supply'
    ) {
      const driverId = resolveDriverId(request);
      const body = parseUpdateDriverSupplyRequest(await readJson(request));
      const supply = await updateDriverSupplyFromApp({
        drivers: driverSupplyRepository,
        driverId,
        ...body,
      });

      json(response, 200, {
        driverId: supply.driverId,
        vehicleId: supply.vehicleId,
        categories: supply.categories,
        fourByFour: supply.fourByFour,
        seatCapacity: supply.seatCapacity,
        online: supply.online,
        busy: supply.busy,
        latitude: supply.latitude,
        longitude: supply.longitude,
        locationUpdatedAt: supply.locationUpdatedAt,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/ride'
    ) {
      const driverId = resolveDriverId(request);
      const ride = await currentDriverRide({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        driverId,
      });
      json(response, 200, { ride });
      return;
    }

    const driverRideAction = requestUrl.pathname.match(
      /^\/v1\/driver\/me\/rides\/([0-9a-fA-F-]+)\/(arrive|start|complete)$/,
    );
    if (request.method === 'POST' && driverRideAction != null) {
      const driverId = resolveDriverId(request);
      const rideId = driverRideAction[1]!;
      const action = driverRideAction[2] as
        | 'arrive'
        | 'start'
        | 'complete';

      const result = await performDriverRideAction({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        finance: financeRepository,
        driverId,
        rideId,
        action,
      });
      json(response, 200, result);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/offer'
    ) {
      const driverId = resolveDriverId(request);
      const offer = await currentDriverOffer({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        matching: rideMatchingRepository,
        driverId,
      });
      json(response, 200, { offer });
      return;
    }

    const driverOfferAction = requestUrl.pathname.match(
      /^\/v1\/driver\/me\/offers\/([0-9a-fA-F-]+)\/(accept|reject)$/,
    );
    if (request.method === 'POST' && driverOfferAction != null) {
      const driverId = resolveDriverId(request);
      const offerId = driverOfferAction[1]!;
      const action = driverOfferAction[2]!;

      if (action === 'accept') {
        const result = await acceptOfferFromDriverApp({
          rides: rideRepository,
          matching: rideMatchingRepository,
          offerId,
          driverId,
        });
        json(response, 200, result);
        return;
      }

      const result = await rejectOfferFromDriverApp({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        matching: rideMatchingRepository,
        offerId,
        driverId,
      });
      json(response, 200, result);
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

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/rides/prepare'
    ) {
      const passengerId = resolvePassengerId(request);
      if (routingDistanceProvider == null) {
        json(response, 503, {
          error: 'ROUTING_NOT_CONFIGURED',
          message:
            'ROUTING_BASE_URL é obrigatório para preparar preço final de coleta.',
        });
        return;
      }

      const body = parsePrepareRideRequest(await readJson(request));
      const ride = await prepareRideForPayment({
        repository: ridePreparationRepository,
        drivers: driverSupplyRepository,
        routing: routingDistanceProvider,
        passengerId,
        quoteRequest: body.quoteRequest,
        pickup: body.pickup,
      });

      const { reservedDriverId: _internalReservedDriverId, ...publicRide } = ride;
      json(response, 201, {
        ride: publicRide,
        priceFinal: true,
        holdExpiresAt: ride.driverHoldExpiresAt,
      });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/v1/rides') {
      const passengerId = resolvePassengerId(request);
      const body = parseCreateRideRequest(await readJson(request));
      const ride = await createRide(rideRepository, {
        passengerId,
        quoteRequest: body.quoteRequest,
      });
      json(response, 201, ride);
      return;
    }

    const rideMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)$/,
    );
    if (request.method === 'GET' && rideMatch != null) {
      const passengerId = resolvePassengerId(request);
      const ride = await rideRepository.findById(rideMatch[1]!);

      if (ride == null || ride.passengerId !== passengerId) {
        json(response, 404, { error: 'RIDE_NOT_FOUND' });
        return;
      }

      json(response, 200, ride);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/v1/wallet') {
      const passengerId = resolvePassengerId(request);
      const balanceCents = await passengerWalletBalanceCents(
        financeRepository,
        passengerId,
      );

      json(response, 200, { balanceCents });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/wallet/topups'
    ) {
      const passengerId = resolvePassengerId(request);
      const body = parseCreateWalletTopupRequest(await readJson(request));
      const topup = await createWalletTopup(financeRepository, {
        passengerId,
        method: body.method,
        processor: resolvePaymentProcessor(body.method),
        amountCents: body.amountCents,
        idempotencyKey: readIdempotencyKey(request.headers),
      });

      json(response, 201, {
        ...topup,
        simulated: true,
        actionable: false,
        message:
          'Intenção de recarga criada. O saldo só será creditado ' +
          'quando um gateway real confirmar o pagamento.',
      });
      return;
    }

    const paymentMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/payments$/,
    );
    if (request.method === 'POST' && paymentMatch != null) {
      const passengerId = resolvePassengerId(request);
      const ride = await rideRepository.findById(paymentMatch[1]!);

      if (ride == null || ride.passengerId !== passengerId) {
        json(response, 404, { error: 'RIDE_NOT_FOUND' });
        return;
      }

      const body = parseCreatePaymentRequest(await readJson(request));
      const idempotencyKey = readIdempotencyKey(request.headers);

      if (body.method === 'wallet') {
        const result = await payRideWithWallet(financeRepository, {
          ride,
          passengerId,
          idempotencyKey,
        });
        const paidRide = await confirmRidePayment(rideRepository, {
          rideId: ride.id,
          payment: result.payment,
        });

        let dispatchStatus:
          | 'SEARCHING_DRIVER'
          | 'NO_DRIVER_FOUND'
          | 'NOT_PREPARED'
          | 'PENDING_RETRY' = 'PENDING_RETRY';

        try {
          const dispatch = await dispatchRideAfterPayment({
            ride: paidRide,
            rides: rideRepository,
            drivers: driverSupplyRepository,
            matching: rideMatchingRepository,
          });
          dispatchStatus =
            dispatch.kind === 'OFFER_CREATED' ||
            dispatch.kind === 'OFFER_ACTIVE'
              ? 'SEARCHING_DRIVER'
              : dispatch.kind;
        } catch (dispatchError) {
          console.error(
            'Pagamento confirmado, mas despacho automático falhou.',
            dispatchError,
          );
        }

        const latestRide =
          (await rideRepository.findById(ride.id)) ?? paidRide;
        const {
          reservedDriverId: _internalReservedDriverId,
          ...publicRide
        } = latestRide;

        const walletBalanceCents = await passengerWalletBalanceCents(
          financeRepository,
          passengerId,
        );

        json(response, 201, {
          payment: result.payment,
          ride: publicRide,
          dispatchStatus,
          walletBalanceCents,
          duplicatePayment: result.duplicatePayment,
        });
        return;
      }

      const payment = await createPaymentForRide(financeRepository, {
        ride,
        method: body.method,
        processor: resolvePaymentProcessor(body.method),
        idempotencyKey,
      });

      json(response, 201, {
        ...payment,
        simulated: true,
        actionable: false,
        message:
          'Registro de pagamento criado para desenvolvimento. ' +
          'Nenhum Pix/cartão real foi cobrado.',
      });
      return;
    }

    json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    if (
      error instanceof InvalidQuoteRequestError ||
      error instanceof InvalidRideRequestError ||
      error instanceof InvalidPaymentRequestError ||
      error instanceof InvalidWalletRequestError ||
      error instanceof InvalidDriverRequestError
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

    if (error instanceof PaymentProcessorUnavailableError) {
      json(response, 503, {
        error: 'PAYMENT_PROCESSOR_NOT_CONFIGURED',
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverAppError) {
      const status =
        error.code === 'DRIVER_NOT_REGISTERED' ||
        error.code === 'RIDE_NOT_FOUND'
          ? 404
          : error.code === 'RIDE_NOT_ASSIGNED_TO_DRIVER' ||
              error.code === 'INVALID_RIDE_ACTION'
            ? 409
            : 422;
      json(response, status, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof DriverSupplyError) {
      json(response, 422, {
        error: 'INVALID_DRIVER_SUPPLY',
        message: error.message,
      });
      return;
    }

    if (error instanceof RideOfferError) {
      const status = error.code === 'OFFER_NOT_FOUND' ? 404 : 409;
      json(response, status, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof WalletDomainError) {
      json(response, 422, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof RidePaymentConfirmationError) {
      const status = error.code === 'RIDE_NOT_FOUND' ? 404 : 422;
      json(response, status, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof PaymentDomainError) {
      json(response, 422, { error: error.code, message: error.message });
      return;
    }

    if (error instanceof RidePreparationError) {
      const status =
        error.code === 'ROUTING_UNAVAILABLE' ? 503 : 422;
      json(response, status, {
        error: error.code,
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
