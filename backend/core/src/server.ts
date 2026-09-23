import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { isIP } from 'node:net';

import { quoteFare } from './pricing/quote-engine.js';
import { PricingError } from './pricing/types.js';
import { InvalidQuoteRequestError, parseQuoteRequest } from './pricing/validation.js';
import { pricingPeriodAt } from './pricing/period.js';
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
import { PayoutDomainError } from './payments/payout.js';
import {
  driverFinanceSummary,
  requestDriverPayoutFromApp,
} from './drivers/driver-finance-service.js';
import {
  InvalidDriverFinanceRequestError,
  parseDriverPayoutRequest,
} from './drivers/driver-finance-validation.js';
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
  AuthenticationError,
  authenticateBearer,
  issueAuthSession,
  revokeBearerSession,
} from './auth/auth-service.js';
import {
  normalizeBrazilMobilePhone,
  PhoneOtpError,
  requestPhoneOtp,
  resolveOtpHashSecret,
  resolveOtpRateLimitSecret,
  verifyPhoneOtp,
} from './auth/phone-otp-service.js';
import { resolveOtpDeliveryProviderFromEnv } from './auth/otp-delivery-provider.js';
import {
  AdminAuthenticationError,
  authenticateAdminBearer,
} from './admin/admin-auth.js';
import {
  AdminDriverAuthError,
  getDriverAuthForAdmin,
  provisionDriverAuthFromAdmin,
  setDriverAuthStatusFromAdmin,
} from './admin/admin-driver-auth-service.js';
import {
  InvalidAdminRequestError,
  parseAdminAuditLimit,
  parseAdminDriverProvisionRequest,
  parseAdminDriverStatusRequest,
} from './admin/admin-validation.js';
import {
  acceptOfferFromDriverApp,
  currentDriverOffer,
  driverOfferView,
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
import { PricingLocationMismatchError } from './rides/pricing-location-validation.js';
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
import {
  refundWalletRideAfterNoDriver,
  RideRefundError,
} from './rides/refund-no-driver.js';
import { passengerRideTracking } from './rides/passenger-ride-tracking.js';
import { RealtimeHub } from './realtime/realtime-hub.js';
import { attachRealtimeServer } from './realtime/realtime-server.js';
import { resolveCorePort } from './config/runtime-config.js';
import {
  HttpRequestBodyError,
  readJsonBody as readJson,
} from './http/request-body.js';

const port = resolveCorePort();
const {
  authSessionRepository,
  authOtpRepository,
  adminRepository,
  rideRepository,
  financeRepository,
  driverSupplyRepository,
  ridePreparationRepository,
  rideMatchingRepository,
  storageMode,
} = createRepositories();
const routingDistanceProvider = createRoutingDistanceProviderFromEnv();
const realtimeHub = new RealtimeHub();
const otpDeliveryProvider = resolveOtpDeliveryProviderFromEnv();
resolveOtpHashSecret();
resolveOtpRateLimitSecret();

function headerValue(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = value?.trim();
  return normalized || undefined;
}

function requestClientIp(request: IncomingMessage): string | undefined {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = headerValue(request, 'x-forwarded-for')
      ?.split(',')[0]
      ?.trim();
    if (forwarded != null && isIP(forwarded) !== 0) {
      return forwarded;
    }
  }

  const remote = request.socket.remoteAddress?.trim();
  return remote != null && isIP(remote) !== 0 ? remote : undefined;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://ramo-nossa.local');
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, {
        ok: true,
        service: 'ramo-nessa-core',
        ...(process.env.NODE_ENV === 'production' ? {} : { storageMode }),
      });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/auth/otp/request'
    ) {
      const body = await readJson(request);
      const subjectType =
        body != null && typeof body === 'object' && 'subjectType' in body
          ? String((body as { subjectType?: unknown }).subjectType ?? '')
          : '';
      const phone =
        body != null && typeof body === 'object' && 'phone' in body
          ? String((body as { phone?: unknown }).phone ?? '')
          : '';

      if (subjectType !== 'passenger' && subjectType !== 'driver') {
        json(response, 422, {
          error: 'INVALID_AUTH_SUBJECT_TYPE',
          message: 'Tipo de conta inválido.',
        });
        return;
      }

      const requested = await requestPhoneOtp({
        repository: authOtpRepository,
        delivery: otpDeliveryProvider,
        subjectType,
        phone,
        context: {
          clientIp: requestClientIp(request),
          clientInstanceId: headerValue(request, 'x-client-instance-id'),
        },
      });
      json(response, 202, requested);
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/auth/otp/verify'
    ) {
      const body = await readJson(request);
      const challengeId =
        body != null && typeof body === 'object' && 'challengeId' in body
          ? String((body as { challengeId?: unknown }).challengeId ?? '')
          : '';
      const code =
        body != null && typeof body === 'object' && 'code' in body
          ? String((body as { code?: unknown }).code ?? '')
          : '';

      const verified = await verifyPhoneOtp({
        repository: authOtpRepository,
        sessions: authSessionRepository,
        challengeId,
        code,
      });
      json(response, 201, verified);
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/auth/dev/driver-identity'
    ) {
      if (
        process.env.NODE_ENV === 'production' ||
        process.env.ALLOW_DEV_IDENTITY !== 'true'
      ) {
        json(response, 404, { error: 'NOT_FOUND' });
        return;
      }

      const body = await readJson(request);
      const driverId =
        body != null && typeof body === 'object' && 'driverId' in body
          ? String((body as { driverId?: unknown }).driverId ?? '').trim()
          : '';
      const rawPhone =
        body != null && typeof body === 'object' && 'phone' in body
          ? String((body as { phone?: unknown }).phone ?? '')
          : '';
      if (driverId.length < 3) {
        json(response, 422, {
          error: 'INVALID_DRIVER_ID',
          message: 'driverId é obrigatório.',
        });
        return;
      }

      const phoneE164 = normalizeBrazilMobilePhone(rawPhone);
      const existing = await authOtpRepository.findIdentityByPhone(
        'driver',
        phoneE164,
      );
      if (existing != null) {
        if (existing.subjectId !== driverId) {
          json(response, 409, {
            error: 'PHONE_ALREADY_REGISTERED',
            message: 'Telefone já associado a outro motorista.',
          });
          return;
        }
        json(response, 200, existing);
        return;
      }

      const now = new Date().toISOString();
      const identity = await authOtpRepository.createIdentity({
        id: randomUUID(),
        subjectId: driverId,
        subjectType: 'driver',
        phoneE164,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      json(response, 201, identity);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/auth/me'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      json(response, 200, {
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        expiresAt: session.expiresAt,
      });
      return;
    }

    if (
      request.method === 'DELETE' &&
      requestUrl.pathname === '/v1/auth/session'
    ) {
      await revokeBearerSession({
        repository: authSessionRepository,
        headers: request.headers,
      });
      response.writeHead(204, {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end();
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/auth/dev/session'
    ) {
      if (
        process.env.NODE_ENV === 'production' ||
        process.env.ALLOW_DEV_IDENTITY !== 'true'
      ) {
        json(response, 404, { error: 'NOT_FOUND' });
        return;
      }

      const body = await readJson(request);
      const subjectType =
        body != null && typeof body === 'object' && 'subjectType' in body
          ? String((body as { subjectType?: unknown }).subjectType ?? '')
          : '';
      const subjectId =
        body != null && typeof body === 'object' && 'subjectId' in body
          ? String((body as { subjectId?: unknown }).subjectId ?? '')
          : '';

      if (
        (subjectType !== 'passenger' && subjectType !== 'driver') ||
        subjectId.trim().length < 3
      ) {
        json(response, 422, {
          error: 'INVALID_AUTH_SESSION_REQUEST',
          message: 'subjectType e subjectId são obrigatórios.',
        });
        return;
      }

      const issued = await issueAuthSession({
        repository: authSessionRepository,
        subjectId,
        subjectType,
      });

      json(response, 201, {
        accessToken: issued.token,
        tokenType: 'Bearer',
        expiresAt: issued.session.expiresAt,
        subjectId: issued.session.subjectId,
        subjectType: issued.session.subjectType,
      });
      return;
    }

    const adminDriverAuthStatusMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/auth\/status$/,
    );
    if (
      request.method === 'PATCH' &&
      adminDriverAuthStatusMatch != null
    ) {
      const actor = await authenticateAdminBearer({
        repository: adminRepository,
        headers: request.headers,
        requiredScope: 'drivers:auth:write',
      });
      const body = parseAdminDriverStatusRequest(
        await readJson(request),
      );
      const result = await setDriverAuthStatusFromAdmin({
        identities: authOtpRepository,
        sessions: authSessionRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverAuthStatusMatch[1]!,
        status: body.status,
      });
      json(response, 200, {
        driverId: result.identity.subjectId,
        phoneE164: result.identity.phoneE164,
        status: result.identity.status,
        updatedAt: result.identity.updatedAt,
        revokedSessions: result.revokedSessions,
      });
      return;
    }

    const adminDriverAuthMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/auth$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverAuthMatch != null
    ) {
      await authenticateAdminBearer({
        repository: adminRepository,
        headers: request.headers,
        requiredScope: 'drivers:auth:read',
      });
      const identity = await getDriverAuthForAdmin({
        identities: authOtpRepository,
        driverId: adminDriverAuthMatch[1]!,
      });
      json(response, 200, {
        driverId: identity.subjectId,
        phoneE164: identity.phoneE164,
        status: identity.status,
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt,
      });
      return;
    }

    if (
      request.method === 'PUT' &&
      adminDriverAuthMatch != null
    ) {
      const actor = await authenticateAdminBearer({
        repository: adminRepository,
        headers: request.headers,
        requiredScope: 'drivers:auth:write',
      });
      const body = parseAdminDriverProvisionRequest(
        await readJson(request),
      );
      const result = await provisionDriverAuthFromAdmin({
        identities: authOtpRepository,
        sessions: authSessionRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverAuthMatch[1]!,
        phone: body.phone,
        status: body.status,
      });
      json(response, result.created ? 201 : 200, {
        created: result.created,
        driverId: result.identity.subjectId,
        phoneE164: result.identity.phoneE164,
        status: result.identity.status,
        createdAt: result.identity.createdAt,
        updatedAt: result.identity.updatedAt,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/audit'
    ) {
      await authenticateAdminBearer({
        repository: adminRepository,
        headers: request.headers,
        requiredScope: 'audit:read',
      });
      const limit = parseAdminAuditLimit(
        requestUrl.searchParams.get('limit'),
      );
      const entries = await adminRepository.listAudit(limit);
      json(response, 200, { entries });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/finance'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const finance = await driverFinanceSummary(
        financeRepository,
        driverId,
      );
      json(response, 200, finance);
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/driver/me/payouts'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = parseDriverPayoutRequest(await readJson(request));
      const result = await requestDriverPayoutFromApp({
        repository: financeRepository,
        driverId,
        amountCents: body.amountCents,
        idempotencyKey: readIdempotencyKey(request.headers),
      });

      json(response, 201, {
        payout: {
          id: result.payout.id,
          amountCents: result.payout.amountCents,
          status: result.payout.status,
          createdAt: result.payout.createdAt,
        },
        duplicateRequest: result.duplicateRequest,
        finance: result.finance,
        actionable: false,
        message:
          'Saque reservado. O repasse Pix real será executado quando ' +
          'o provedor de repasses estiver conectado.',
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/supply'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = parseUpdateDriverSupplyRequest(await readJson(request));
      const supply = await updateDriverSupplyFromApp({
        drivers: driverSupplyRepository,
        driverId,
        ...body,
      });

      const activeRide =
        await rideRepository.findActiveByDriverId(driverId);
      if (activeRide != null) {
        const tracking = await passengerRideTracking({
          rides: rideRepository,
          drivers: driverSupplyRepository,
          rideId: activeRide.id,
          passengerId: activeRide.passengerId,
        });
        if (tracking != null) {
          realtimeHub.publishPassengerRide(activeRide.id, {
            type: 'passenger.ride.tracking',
            tracking,
            serverTime: new Date().toISOString(),
          });
        }
      }

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
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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

      realtimeHub.publishDriver(driverId, {
        type: 'driver.ride.updated',
        ride: result.ride,
        serverTime: new Date().toISOString(),
      });

      const ride = await rideRepository.findById(rideId);
      if (ride != null) {
        const tracking = await passengerRideTracking({
          rides: rideRepository,
          drivers: driverSupplyRepository,
          rideId,
          passengerId: ride.passengerId,
        });
        if (tracking != null) {
          realtimeHub.publishPassengerRide(rideId, {
            type: 'passenger.ride.tracking',
            tracking,
            serverTime: new Date().toISOString(),
          });
        }
      }

      json(response, 200, result);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/offer'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const offerId = driverOfferAction[1]!;
      const action = driverOfferAction[2]!;

      if (action === 'accept') {
        const result = await acceptOfferFromDriverApp({
          rides: rideRepository,
          matching: rideMatchingRepository,
          offerId,
          driverId,
        });

        realtimeHub.publishDriver(driverId, {
          type: 'driver.offer.updated',
          offer: null,
          serverTime: new Date().toISOString(),
        });
        realtimeHub.publishDriver(driverId, {
          type: 'driver.ride.updated',
          ride: result.ride,
          serverTime: new Date().toISOString(),
        });

        const acceptedRide = await rideRepository.findById(result.ride.id);
        if (acceptedRide != null) {
          const tracking = await passengerRideTracking({
            rides: rideRepository,
            drivers: driverSupplyRepository,
            rideId: acceptedRide.id,
            passengerId: acceptedRide.passengerId,
          });
          if (tracking != null) {
            realtimeHub.publishPassengerRide(acceptedRide.id, {
              type: 'passenger.ride.tracking',
              tracking,
              serverTime: new Date().toISOString(),
            });
          }
        }

        json(response, 200, result);
        return;
      }

      const previousOffer =
        await rideMatchingRepository.findOfferById(offerId);

      const result = await rejectOfferFromDriverApp({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        matching: rideMatchingRepository,
        offerId,
        driverId,
      });
      realtimeHub.publishDriver(driverId, {
        type: 'driver.offer.updated',
        offer: null,
        serverTime: new Date().toISOString(),
      });

      if (previousOffer != null) {
        const offers =
          await rideMatchingRepository.listOffersForRide(
            previousOffer.rideId,
          );
        const nextOffer = [...offers]
          .reverse()
          .find((candidate) => candidate.status === 'OFFERED');

        if (nextOffer != null) {
          const nextRide =
            await rideRepository.findById(nextOffer.rideId);
          if (nextRide != null) {
            realtimeHub.publishDriver(nextOffer.driverId, {
              type: 'driver.offer.updated',
              offer: driverOfferView(nextOffer, nextRide),
              serverTime: new Date().toISOString(),
            });
          }
        }
      }

      json(response, 200, result);
      return;
    }

    if (request.method === 'GET' && request.url === '/v1/payments/policy') {
      json(response, 200, PAYMENT_POLICY_V1);
      return;
    }

    if (request.method === 'POST' && request.url === '/v1/pricing/quote') {
      const body = parseQuoteRequest(await readJson(request));
      const quote = quoteFare({
        ...body,
        period: pricingPeriodAt(),
      });
      json(response, 200, quote);
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/rides/prepare'
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
        dropoff: body.dropoff,
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
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = parseCreateRideRequest(await readJson(request));
      const ride = await createRide(rideRepository, {
        passengerId,
        quoteRequest: body.quoteRequest,
      });
      json(response, 201, ride);
      return;
    }

    const rideTrackingMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/tracking$/,
    );
    if (request.method === 'GET' && rideTrackingMatch != null) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        rideId: rideTrackingMatch[1]!,
        passengerId,
      });

      if (tracking == null) {
        json(response, 404, { error: 'RIDE_NOT_FOUND' });
        return;
      }

      json(response, 200, tracking);
      return;
    }

    const rideMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)$/,
    );
    if (request.method === 'GET' && rideMatch != null) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const ride = await rideRepository.findById(rideMatch[1]!);

      if (ride == null || ride.passengerId !== passengerId) {
        json(response, 404, { error: 'RIDE_NOT_FOUND' });
        return;
      }

      json(response, 200, ride);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/v1/wallet') {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
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

        let currentRide = ride;
        let responsePayment = result.payment;
        let duplicateRefund = false;
        let dispatchStatus:
          | 'SEARCHING_DRIVER'
          | 'NO_DRIVER_FOUND'
          | 'NOT_PREPARED'
          | 'PENDING_RETRY' = 'PENDING_RETRY';

        if (result.payment.status === 'refunded') {
          const refund = await refundWalletRideAfterNoDriver({
            rides: rideRepository,
            finance: financeRepository,
            rideId: ride.id,
            paymentId: result.payment.id,
            passengerId,
          });
          currentRide = refund.ride;
          responsePayment = refund.payment;
          duplicateRefund = refund.duplicateRefund;
          dispatchStatus = 'NO_DRIVER_FOUND';
        } else {
          currentRide = await confirmRidePayment(rideRepository, {
            rideId: ride.id,
            payment: result.payment,
          });

          if (
            currentRide.state === 'NO_DRIVER_FOUND' ||
            currentRide.state === 'REFUND_PENDING'
          ) {
            const refund = await refundWalletRideAfterNoDriver({
              rides: rideRepository,
              finance: financeRepository,
              rideId: ride.id,
              paymentId: result.payment.id,
              passengerId,
            });
            currentRide = refund.ride;
            responsePayment = refund.payment;
            duplicateRefund = refund.duplicateRefund;
            dispatchStatus = 'NO_DRIVER_FOUND';
          } else if (
            currentRide.state === 'DRIVER_ASSIGNED' ||
            currentRide.state === 'DRIVER_ARRIVING' ||
            currentRide.state === 'DRIVER_ARRIVED' ||
            currentRide.state === 'IN_PROGRESS' ||
            currentRide.state === 'COMPLETED'
          ) {
            // Replay do mesmo pagamento depois que a corrida já avançou.
            dispatchStatus = 'SEARCHING_DRIVER';
          } else {
            let dispatch:
              | Awaited<ReturnType<typeof dispatchRideAfterPayment>>
              | undefined;
            try {
              dispatch = await dispatchRideAfterPayment({
                ride: currentRide,
                rides: rideRepository,
                drivers: driverSupplyRepository,
                matching: rideMatchingRepository,
              });
            } catch (dispatchError) {
              console.error(
                'Pagamento confirmado, mas despacho automático falhou.',
                dispatchError,
              );
            }

            if (dispatch != null) {
              dispatchStatus =
                dispatch.kind === 'OFFER_CREATED' ||
                dispatch.kind === 'OFFER_ACTIVE'
                  ? 'SEARCHING_DRIVER'
                  : dispatch.kind;

              if (
                dispatch.kind === 'OFFER_CREATED' ||
                dispatch.kind === 'OFFER_ACTIVE'
              ) {
                const offerRide =
                  await rideRepository.findById(dispatch.offer.rideId);
                if (offerRide != null) {
                  realtimeHub.publishDriver(dispatch.offer.driverId, {
                    type: 'driver.offer.updated',
                    offer: driverOfferView(dispatch.offer, offerRide),
                    serverTime: new Date().toISOString(),
                  });
                }
              } else if (
                dispatch.kind === 'NO_DRIVER_FOUND' ||
                dispatch.kind === 'NOT_PREPARED'
              ) {
                const refund = await refundWalletRideAfterNoDriver({
                  rides: rideRepository,
                  finance: financeRepository,
                  rideId: ride.id,
                  paymentId: result.payment.id,
                  passengerId,
                });
                currentRide = refund.ride;
                responsePayment = refund.payment;
                duplicateRefund = refund.duplicateRefund;
                if (dispatch.kind === 'NOT_PREPARED') {
                  dispatchStatus = 'NOT_PREPARED';
                }
              }
            }
          }
        }

        const latestRide =
          (await rideRepository.findById(ride.id)) ?? currentRide;
        const {
          reservedDriverId: _internalReservedDriverId,
          ...publicRide
        } = latestRide;

        const walletBalanceCents = await passengerWalletBalanceCents(
          financeRepository,
          passengerId,
        );

        json(response, 201, {
          payment: responsePayment,
          ride: publicRide,
          dispatchStatus,
          walletBalanceCents,
          duplicatePayment: result.duplicatePayment,
          duplicateRefund,
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
      error instanceof InvalidDriverRequestError ||
      error instanceof InvalidDriverFinanceRequestError
    ) {
      json(response, 400, { error: 'INVALID_REQUEST', message: error.message });
      return;
    }

    if (error instanceof InvalidAdminRequestError) {
      json(response, 400, {
        error: 'INVALID_ADMIN_REQUEST',
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminAuthenticationError) {
      const status =
        error.code === 'ADMIN_SCOPE_REQUIRED' ? 403 : 401;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminDriverAuthError) {
      const status =
        error.code === 'DRIVER_AUTH_NOT_FOUND'
          ? 404
          : error.code === 'DRIVER_PHONE_CONFLICT' ||
              error.code === 'DRIVER_ID_CONFLICT'
            ? 409
            : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PhoneOtpError) {
      let status: number;
      switch (error.code) {
        case 'INVALID_PHONE':
          status = 422;
          break;
        case 'DRIVER_NOT_REGISTERED':
        case 'AUTH_IDENTITY_SUSPENDED':
          status = 403;
          break;
        case 'OTP_RATE_LIMITED':
          status = 429;
          break;
        case 'OTP_INVALID_OR_EXPIRED':
          status = 401;
          break;
        case 'OTP_DELIVERY_NOT_CONFIGURED':
        case 'OTP_DELIVERY_FAILED':
          status = 503;
          break;
      }
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AuthenticationError) {
      json(response, 401, {
        error: error.code,
        message: error.message,
      });
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

    if (error instanceof PayoutDomainError) {
      json(response, 422, { error: error.code, message: error.message });
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

    if (error instanceof PricingLocationMismatchError) {
      json(response, 422, {
        error: 'PRICING_LOCATION_MISMATCH',
        message: error.message,
      });
      return;
    }

    if (error instanceof RideRefundError) {
      const status =
        error.code === 'RIDE_NOT_FOUND' || error.code === 'PAYMENT_NOT_FOUND'
          ? 404
          : error.code === 'REFUND_NOT_ALLOWED'
            ? 409
            : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
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

    if (error instanceof HttpRequestBodyError) {
      json(response, 413, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof SyntaxError) {
      json(response, 400, { error: 'INVALID_JSON' });
      return;
    }

    console.error('Unhandled Core request error.', error);
    json(response, 500, { error: 'INTERNAL_ERROR' });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 35_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;

attachRealtimeServer({
  server,
  hub: realtimeHub,
  rides: rideRepository,
  drivers: driverSupplyRepository,
  matching: rideMatchingRepository,
  sessions: authSessionRepository,
  identities: authOtpRepository,
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Ramo Nessa Core listening on :${port}`);
});
