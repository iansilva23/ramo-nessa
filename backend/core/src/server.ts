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
  authenticateAdminPrincipal,
} from './admin/admin-authorization.js';
import {
  AdminHumanAuthenticationError,
  authenticateAdminHumanSession,
  loginAdminHuman,
  resolveAdminLoginRateLimitSecret,
  revokeAdminHumanSession,
} from './admin/admin-human-auth-service.js';
import {
  resolveAdminMfaEncryptionKey,
} from './admin/admin-human-crypto.js';
import {
  AdminDriverAuthError,
  getDriverAuthForAdmin,
  provisionDriverAuthFromAdmin,
  setDriverAuthStatusFromAdmin,
} from './admin/admin-driver-auth-service.js';
import {
  InvalidAdminRequestError,
  encodeAdminIdentityDirectoryCursor,
  encodeAdminRideDirectoryCursor,
  parseAdminAuditLimit,
  parseAdminIdentityDirectoryQuery,
  parseAdminRideDirectoryQuery,
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
  DriverDocumentError,
  getDriverDocumentsForAdmin,
  reviewDriverDocumentFromAdmin,
  submitDriverDocumentFromAdmin,
} from './drivers/driver-document-service.js';
import {
  InvalidDriverDocumentRequestError,
  parseReviewDriverDocumentRequest,
  parseSubmitDriverDocumentRequest,
} from './drivers/driver-document-validation.js';
import type {
  DriverDocumentType,
} from './drivers/driver-document-repository.js';
import {
  DriverRegistryError,
  getDriverRegistryForAdmin,
  setDriverRegistryStatusFromAdmin,
  upsertDriverRegistryFromAdmin,
} from './drivers/driver-registry-service.js';
import {
  InvalidDriverRegistryRequestError,
  parseUpdateDriverRegistryStatusRequest,
  parseUpsertDriverRegistryRequest,
} from './drivers/driver-registry-validation.js';
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
import { adminPricingCatalogView } from './pricing/admin-catalog.js';
import { resolvePricingCatalogContext } from './pricing/effective-catalog.js';
import {
  createPricingCatalogDraft,
  pricingCatalogVersionView,
  publishPricingCatalogVersion,
  PricingCatalogVersionError,
  updatePricingCatalogDraft,
} from './pricing/pricing-catalog-version-service.js';
import {
  InvalidPricingCatalogPatchError,
  parsePricingCatalogDraftPatch,
} from './pricing/pricing-catalog-version-validation.js';
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
import {
  resolveCorePort,
  resolveShutdownTimeoutMs,
} from './config/runtime-config.js';
import {
  errorFields,
  logError,
  logInfo,
  logWarn,
  resolveRequestId,
} from './observability/logger.js';
import {
  HttpRequestBodyError,
  readJsonBody as readJson,
} from './http/request-body.js';

const port = resolveCorePort();
const {
  authSessionRepository,
  authOtpRepository,
  adminRepository,
  adminHumanAuthRepository,
  rideRepository,
  financeRepository,
  driverSupplyRepository,
  driverRegistryRepository,
  driverDocumentRepository,
  pricingCatalogVersionRepository,
  ridePreparationRepository,
  rideMatchingRepository,
  storageMode,
  readinessCheck,
  close: closeRepositories,
} = createRepositories();
const routingDistanceProvider = createRoutingDistanceProviderFromEnv();
const realtimeHub = new RealtimeHub();
const otpDeliveryProvider = resolveOtpDeliveryProviderFromEnv();
resolveOtpHashSecret();
resolveOtpRateLimitSecret();
const adminMfaEncryptionKey = resolveAdminMfaEncryptionKey();
const adminLoginRateLimitSecret = resolveAdminLoginRateLimitSecret();

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

let shuttingDown = false;
const shutdownTimeoutMs = resolveShutdownTimeoutMs();

const server = createServer(async (request, response) => {
  const requestId = resolveRequestId(
    headerValue(request, 'x-request-id'),
  );
  const startedAt = Date.now();
  let requestPath = '/';

  response.setHeader('x-request-id', requestId);
  response.once('finish', () => {
    logInfo('http.request.completed', {
      requestId,
      method: request.method ?? 'UNKNOWN',
      path: requestPath,
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  try {
    const requestUrl = new URL(request.url ?? '/', 'http://ramo-nossa.local');
    requestPath = requestUrl.pathname;
    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/health'
    ) {
      json(response, 200, {
        ok: true,
        service: 'ramo-nessa-core',
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/ready'
    ) {
      if (shuttingDown) {
        json(response, 503, {
          ok: false,
          service: 'ramo-nessa-core',
          reason: 'SHUTTING_DOWN',
        });
        return;
      }

      try {
        await readinessCheck();
        json(response, 200, {
          ok: true,
          service: 'ramo-nessa-core',
          ...(process.env.NODE_ENV === 'production' ? {} : { storageMode }),
        });
      } catch (readinessError) {
        logWarn('core.readiness.failed', {
          requestId,
          ...errorFields(readinessError),
        });
        json(response, 503, {
          ok: false,
          service: 'ramo-nessa-core',
          reason: 'DEPENDENCY_UNAVAILABLE',
        });
      }
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
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
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

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/admin/auth/login'
    ) {
      const body = await readJson(request);
      if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        throw new InvalidAdminRequestError(
          'Corpo da requisição é inválido.',
        );
      }
      const value = body as Record<string, unknown>;
      const email =
        typeof value.email === 'string' ? value.email : '';
      const password =
        typeof value.password === 'string' ? value.password : '';
      const totpCode =
        typeof value.totpCode === 'string' ? value.totpCode : '';

      const logged = await loginAdminHuman({
        repository: adminHumanAuthRepository,
        email,
        password,
        totpCode,
        clientIp: requestClientIp(request),
        encryptionKey: adminMfaEncryptionKey,
        rateLimitSecret: adminLoginRateLimitSecret,
      });
      json(response, 200, {
        accessToken: logged.accessToken,
        expiresAt: logged.session.expiresAt,
        user: {
          id: logged.user.id,
          name: logged.user.name,
          email: logged.user.emailNormalized,
          scopes: logged.user.scopes,
        },
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/auth/me'
    ) {
      const authenticated = await authenticateAdminHumanSession({
        repository: adminHumanAuthRepository,
        headers: request.headers,
      });
      json(response, 200, {
        user: {
          id: authenticated.user.id,
          name: authenticated.user.name,
          email: authenticated.user.emailNormalized,
          scopes: authenticated.user.scopes,
        },
        expiresAt: authenticated.session.expiresAt,
      });
      return;
    }

    if (
      request.method === 'DELETE' &&
      requestUrl.pathname === '/v1/admin/auth/session'
    ) {
      await revokeAdminHumanSession({
        repository: adminHumanAuthRepository,
        headers: request.headers,
      });
      response.writeHead(204, {
        'cache-control': 'no-store',
      });
      response.end();
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/dashboard'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });

      const generatedAt = new Date();
      const since = new Date(
        generatedAt.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString();

      const [summary, activeRides] = await Promise.all([
        rideRepository.getAdminOperationalSummary(since),
        rideRepository.listAdminActive(20),
      ]);

      json(response, 200, {
        generatedAt: generatedAt.toISOString(),
        window: {
          kind: 'last_24h',
          since,
        },
        rides: summary,
        activeRides: activeRides.map((ride) => ({
          id: ride.id,
          state: ride.state,
          paymentStatus: ride.paymentStatus,
          passengerId: ride.passengerId,
          driverId: ride.driverId ?? null,
          reservedDriverId: ride.reservedDriverId ?? null,
          category: ride.category,
          origin: ride.origin,
          destination: ride.destination,
          totalAmountCents: ride.quote.totalAmountCents,
          createdAt: ride.createdAt,
          updatedAt: ride.updatedAt,
        })),
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/pricing/catalog'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:read',
      });
      const pricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
      });
      json(
        response,
        200,
        adminPricingCatalogView(pricing.snapshot, {
          mode: pricing.version == null ? 'static' : 'versioned',
          editable: false,
          versionId: pricing.version?.id ?? null,
          versionNumber: pricing.version?.versionNumber ?? null,
          effectiveFrom: pricing.version?.effectiveFrom ?? null,
        }),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/pricing/versions'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:read',
      });
      const [versions, effective] = await Promise.all([
        pricingCatalogVersionRepository.list(50),
        pricingCatalogVersionRepository.findEffective(
          new Date().toISOString(),
        ),
      ]);
      json(response, 200, {
        items: versions.map(pricingCatalogVersionView),
        effectiveVersionId: effective?.id ?? null,
      });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/admin/pricing/versions'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:write',
      });
      const currentPricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
      });
      const draft = await createPricingCatalogDraft({
        versions: pricingCatalogVersionRepository,
        admin: adminRepository,
        actor,
        snapshot: structuredClone(currentPricing.snapshot),
      });
      json(response, 201, pricingCatalogVersionView(draft));
      return;
    }

    const pricingVersionMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/pricing\/versions\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/,
    );
    if (
      request.method === 'GET' &&
      pricingVersionMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:read',
      });
      const version =
        await pricingCatalogVersionRepository.findById(
          pricingVersionMatch[1]!,
        );
      if (version == null) {
        json(response, 404, {
          error: 'PRICING_VERSION_NOT_FOUND',
          message: 'Versão de preços não encontrada.',
        });
        return;
      }
      json(response, 200, {
        version: pricingCatalogVersionView(version),
        catalog: adminPricingCatalogView(version.snapshot, {
          mode: 'versioned',
          editable: version.status === 'draft',
          versionId: version.id,
          versionNumber: version.versionNumber,
          effectiveFrom: version.effectiveFrom ?? null,
        }),
      });
      return;
    }

    if (
      request.method === 'PATCH' &&
      pricingVersionMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:write',
      });
      const patch = parsePricingCatalogDraftPatch(
        await readJson(request),
      );
      const updated = await updatePricingCatalogDraft({
        versions: pricingCatalogVersionRepository,
        admin: adminRepository,
        actor,
        versionId: pricingVersionMatch[1]!,
        patch,
      });
      json(response, 200, {
        version: pricingCatalogVersionView(updated),
        catalog: adminPricingCatalogView(updated.snapshot, {
          mode: 'versioned',
          editable: true,
          versionId: updated.id,
          versionNumber: updated.versionNumber,
          effectiveFrom: null,
        }),
      });
      return;
    }

    const pricingPublishMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/pricing\/versions\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\/publish$/,
    );
    if (
      request.method === 'POST' &&
      pricingPublishMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'pricing:write',
      });
      const body = await readJson(request);
      if (
        body != null &&
        (typeof body !== 'object' || Array.isArray(body))
      ) {
        throw new InvalidAdminRequestError(
          'Corpo da publicação de preços é inválido.',
        );
      }
      const rawEffectiveFrom =
        body != null &&
        typeof body === 'object' &&
        'effectiveFrom' in body
          ? (body as { effectiveFrom?: unknown }).effectiveFrom
          : undefined;
      if (
        rawEffectiveFrom != null &&
        typeof rawEffectiveFrom !== 'string'
      ) {
        throw new InvalidAdminRequestError(
          'effectiveFrom deve ser uma data ISO em texto.',
        );
      }

      const published = await publishPricingCatalogVersion({
        versions: pricingCatalogVersionRepository,
        admin: adminRepository,
        actor,
        versionId: pricingPublishMatch[1]!,
        ...(rawEffectiveFrom == null
          ? {}
          : { effectiveFrom: rawEffectiveFrom }),
      });
      json(response, 200, pricingCatalogVersionView(published));
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/rides'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });

      const query = parseAdminRideDirectoryQuery(
        requestUrl.searchParams,
      );
      const page = await rideRepository.listAdmin(query);
      const lastRide = page.rides[page.rides.length - 1];
      const nextCursor =
        page.hasMore && lastRide != null
          ? encodeAdminRideDirectoryCursor({
              updatedAt: lastRide.updatedAt,
              id: lastRide.id,
            })
          : null;

      json(response, 200, {
        items: page.rides.map((ride) => ({
          id: ride.id,
          state: ride.state,
          paymentStatus: ride.paymentStatus,
          passengerId: ride.passengerId,
          driverId: ride.driverId ?? null,
          reservedDriverId: ride.reservedDriverId ?? null,
          category: ride.category,
          origin: ride.origin,
          destination: ride.destination,
          totalAmountCents: ride.quote.totalAmountCents,
          createdAt: ride.createdAt,
          updatedAt: ride.updatedAt,
        })),
        nextCursor,
      });
      return;
    }

    const adminRideMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/rides\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/,
    );
    if (
      request.method === 'GET' &&
      adminRideMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });

      const ride = await rideRepository.findById(
        adminRideMatch[1]!,
      );
      if (ride == null) {
        json(response, 404, {
          error: 'RIDE_NOT_FOUND',
          message: 'Corrida não encontrada.',
        });
        return;
      }

      json(response, 200, {
        id: ride.id,
        state: ride.state,
        paymentStatus: ride.paymentStatus,
        passengerId: ride.passengerId,
        driverId: ride.driverId ?? null,
        reservedDriverId: ride.reservedDriverId ?? null,
        category: ride.category,
        period: ride.period,
        passengers: ride.passengers,
        origin: ride.origin,
        destination: ride.destination,
        tripDistanceKm: ride.tripDistanceKm ?? null,
        driverPickupDistanceKm:
          ride.driverPickupDistanceKm ?? null,
        quote: {
          ruleId: ride.quote.ruleId,
          baseAmountCents: ride.quote.baseAmountCents,
          pickupCompensationCents:
            ride.quote.pickupCompensationCents,
          totalAmountCents: ride.quote.totalAmountCents,
          platformCommissionCents:
            ride.quote.platformCommissionCents,
          driverNetCents: ride.quote.driverNetCents,
        },
        createdAt: ride.createdAt,
        updatedAt: ride.updatedAt,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/passengers'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'passengers:auth:read',
      });
      const query = parseAdminIdentityDirectoryQuery(
        requestUrl.searchParams,
      );
      const [page, summary] = await Promise.all([
        authOtpRepository.listIdentities({
          subjectType: 'passenger',
          ...query,
        }),
        authOtpRepository.countIdentitiesByStatus('passenger'),
      ]);
      const lastIdentity =
        page.identities[page.identities.length - 1];
      const nextCursor =
        page.hasMore && lastIdentity != null
          ? encodeAdminIdentityDirectoryCursor({
              updatedAt: lastIdentity.updatedAt,
              id: lastIdentity.id,
            })
          : null;

      json(response, 200, {
        items: page.identities.map((identity) => ({
          passengerId: identity.subjectId,
          phoneE164: identity.phoneE164,
          status: identity.status,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        })),
        summary,
        nextCursor,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/drivers'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:auth:read',
      });
      const query = parseAdminIdentityDirectoryQuery(
        requestUrl.searchParams,
      );
      const [page, summary] = await Promise.all([
        authOtpRepository.listIdentities({
          subjectType: 'driver',
          ...query,
        }),
        authOtpRepository.countIdentitiesByStatus('driver'),
      ]);
      const lastIdentity =
        page.identities[page.identities.length - 1];
      const nextCursor =
        page.hasMore && lastIdentity != null
          ? encodeAdminIdentityDirectoryCursor({
              updatedAt: lastIdentity.updatedAt,
              id: lastIdentity.id,
            })
          : null;

      json(response, 200, {
        items: page.identities.map((identity) => ({
          driverId: identity.subjectId,
          phoneE164: identity.phoneE164,
          status: identity.status,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        })),
        summary,
        nextCursor,
      });
      return;
    }

    const adminDriverDocumentReviewMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/documents\/(driver_license|vehicle_registration)\/review$/,
      );
    if (
      request.method === 'PATCH' &&
      adminDriverDocumentReviewMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:write',
      });
      const review = parseReviewDriverDocumentRequest(
        await readJson(request),
      );
      const result = await reviewDriverDocumentFromAdmin({
        documents: driverDocumentRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverDocumentReviewMatch[1]!,
        documentType:
          adminDriverDocumentReviewMatch[2]! as DriverDocumentType,
        review,
      });
      json(response, 200, result);
      return;
    }

    const adminDriverDocumentMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/documents\/(driver_license|vehicle_registration)$/,
    );
    if (
      request.method === 'PUT' &&
      adminDriverDocumentMatch != null
    ) {
      const key = await authenticateAdminBearer({
        repository: adminRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:write',
      });
      const data = parseSubmitDriverDocumentRequest(
        await readJson(request),
      );
      const result = await submitDriverDocumentFromAdmin({
        registry: driverRegistryRepository,
        documents: driverDocumentRepository,
        admin: adminRepository,
        actor: {
          kind: 'api_key',
          id: key.id,
          name: key.name,
        },
        driverId: adminDriverDocumentMatch[1]!,
        documentType:
          adminDriverDocumentMatch[2]! as DriverDocumentType,
        data,
      });
      json(response, 201, result);
      return;
    }

    const adminDriverDocumentsMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/documents$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverDocumentsMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:read',
      });
      const result = await getDriverDocumentsForAdmin({
        registry: driverRegistryRepository,
        documents: driverDocumentRepository,
        driverId: adminDriverDocumentsMatch[1]!,
      });
      json(response, 200, result);
      return;
    }

    const adminDriverRegistryStatusMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/registry\/status$/,
      );
    if (
      request.method === 'PATCH' &&
      adminDriverRegistryStatusMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:profile:write',
      });
      const body = parseUpdateDriverRegistryStatusRequest(
        await readJson(request),
      );
      const result = await setDriverRegistryStatusFromAdmin({
        registry: driverRegistryRepository,
        drivers: driverSupplyRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverRegistryStatusMatch[1]!,
        ...body,
      });
      json(response, 200, result);
      return;
    }

    const adminDriverRegistryMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/registry$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverRegistryMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:profile:read',
      });
      const result = await getDriverRegistryForAdmin({
        identities: authOtpRepository,
        registry: driverRegistryRepository,
        driverId: adminDriverRegistryMatch[1]!,
      });
      json(response, 200, result);
      return;
    }

    if (
      request.method === 'PUT' &&
      adminDriverRegistryMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:profile:write',
      });
      const data = parseUpsertDriverRegistryRequest(
        await readJson(request),
      );
      const result = await upsertDriverRegistryFromAdmin({
        identities: authOtpRepository,
        registry: driverRegistryRepository,
        drivers: driverSupplyRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverRegistryMatch[1]!,
        data,
      });
      json(response, 200, result);
      return;
    }

    const adminDriverAuthMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/auth$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverAuthMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
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
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
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
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
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
        registry: driverRegistryRepository,
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
        registry: driverRegistryRepository,
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
        registry: driverRegistryRepository,
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
          registry: driverRegistryRepository,
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
      const now = new Date();
      const pricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
        at: now,
      });
      const quote = quoteFare(
        {
          ...body,
          period: pricingPeriodAt(now),
        },
        pricing.snapshot,
      );
      json(response, 200, {
        ...quote,
        pricingCatalog: pricing.reference,
      });
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
      const now = new Date();
      const pricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
        at: now,
      });
      const ride = await prepareRideForPayment({
        repository: ridePreparationRepository,
        drivers: driverSupplyRepository,
        routing: routingDistanceProvider,
        passengerId,
        quoteRequest: body.quoteRequest,
        pricing,
        pickup: body.pickup,
        dropoff: body.dropoff,
        now,
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
      const now = new Date();
      const pricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
        at: now,
      });
      const ride = await createRide(rideRepository, {
        passengerId,
        quoteRequest: body.quoteRequest,
        pricing,
        now,
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
              logError('ride.dispatch.failed', {
                requestId,
                rideId: currentRide.id,
                ...errorFields(dispatchError),
              });
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

    if (error instanceof InvalidDriverDocumentRequestError) {
      json(response, 400, {
        error: 'INVALID_DRIVER_DOCUMENT_REQUEST',
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidDriverRegistryRequestError) {
      json(response, 400, {
        error: 'INVALID_DRIVER_REGISTRY_REQUEST',
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidAdminRequestError) {
      json(response, 400, {
        error: 'INVALID_ADMIN_REQUEST',
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminHumanAuthenticationError) {
      const status =
        error.code === 'ADMIN_LOGIN_RATE_LIMITED'
          ? 429
          : error.code === 'ADMIN_SCOPE_REQUIRED'
            ? 403
            : error.code === 'ADMIN_USER_EXISTS'
              ? 409
              : 401;
      if (
        error.code === 'ADMIN_LOGIN_RATE_LIMITED' &&
        error.retryAfterSeconds != null
      ) {
        response.setHeader(
          'retry-after',
          String(error.retryAfterSeconds),
        );
      }
      json(response, status, {
        error: error.code,
        message: error.message,
        ...(error.retryAfterSeconds != null
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
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

    if (error instanceof InvalidPricingCatalogPatchError) {
      json(response, 400, {
        error: 'INVALID_PRICING_CATALOG_PATCH',
        message: error.message,
      });
      return;
    }

    if (error instanceof PricingCatalogVersionError) {
      const status =
        error.code === 'PRICING_VERSION_NOT_FOUND' ||
        error.code === 'PRICING_RULE_NOT_FOUND'
          ? 404
          : error.code === 'PRICING_VERSION_NOT_DRAFT' ||
              error.code === 'PRICING_STRUCTURE_CONFLICT'
            ? 409
            : 400;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverDocumentError) {
      const status =
        error.code === 'DOCUMENT_REVIEW_CONFLICT'
          ? 409
          : error.code === 'DOCUMENT_STORAGE_REFERENCE_INVALID' ||
              error.code === 'DOCUMENT_ALREADY_EXPIRED'
            ? 422
            : 404;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverRegistryError) {
      const status =
        error.code === 'VEHICLE_PLATE_CONFLICT'
          ? 409
          : 404;
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
          : error.code === 'DRIVER_REGISTRY_NOT_APPROVED'
            ? 403
            : error.code === 'DRIVER_SUPPLY_NOT_INITIALIZED' ||
                error.code === 'RIDE_NOT_ASSIGNED_TO_DRIVER' ||
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

    logError('http.request.unhandled_error', {
      requestId,
      method: request.method ?? 'UNKNOWN',
      path: requestPath,
      ...errorFields(error),
    });
    json(response, 500, {
      error: 'INTERNAL_ERROR',
      requestId,
    });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 35_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;

const realtimeServer = attachRealtimeServer({
  server,
  hub: realtimeHub,
  rides: rideRepository,
  drivers: driverSupplyRepository,
  registry: driverRegistryRepository,
  matching: rideMatchingRepository,
  sessions: authSessionRepository,
  identities: authOtpRepository,
});

let shutdownPromise: Promise<void> | null = null;

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
    server.closeIdleConnections();
  });
}

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise != null) return shutdownPromise;

  shutdownPromise = (async () => {
    shuttingDown = true;
    logInfo('core.shutdown.started', { signal });

    const forceTimer = setTimeout(() => {
      logError('core.shutdown.timeout', {
        signal,
        timeoutMs: shutdownTimeoutMs,
      });
      server.closeAllConnections();
      process.exitCode = 1;
    }, shutdownTimeoutMs);
    forceTimer.unref();

    realtimeServer.close();

    try {
      await closeHttpServer();
    } finally {
      try {
        await closeRepositories();
      } finally {
        clearTimeout(forceTimer);
      }
    }

    logInfo('core.shutdown.completed', { signal });
  })();

  return shutdownPromise;
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error) => {
      logError('core.shutdown.failed', {
        signal,
        ...errorFields(error),
      });
      process.exitCode = 1;
    });
  });
}

server.listen(port, '0.0.0.0', () => {
  logInfo('core.started', {
    port,
    storageMode,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });
});
