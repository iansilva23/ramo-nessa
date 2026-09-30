import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { isIP } from 'node:net';

import { quoteFare } from './pricing/quote-engine.js';
import { publicFareQuoteView } from './pricing/public-fare-view.js';
import { publicPricingPolicyView } from './pricing/public-pricing-policy.js';
import { PricingError } from './pricing/types.js';
import { InvalidQuoteRequestError, parseQuoteRequest } from './pricing/validation.js';
import { pricingPeriodAt } from './pricing/period.js';
import { PAYMENT_POLICY_V1 } from './payments/payment-policy.js';
import { DriverCashPolicyError } from './payments/cash-policy.js';
import { createPaymentForRide } from './payments/create-payment.js';
import {
  PaymentDomainError,
  type PaymentRecord,
} from './payments/payment.js';
import {
  MercadoPagoOrdersError,
  mercadoPagoOrderRefundState,
  mercadoPagoOrdersClientFromEnv,
  verifyMercadoPagoWebhookSignature,
} from './payments/mercado-pago-orders.js';
import {
  createDriverPayoutProviderFromEnv,
  DriverPayoutProviderError,
} from './payments/driver-payout-provider.js';
import {
  processDriverPayout,
  reconcileDriverPayouts,
} from './payments/driver-payout-processing-service.js';
import {
  createScheduledDriverPayouts,
  scheduledDriverPayoutCycleDate,
} from './payments/driver-payout-policy-service.js';
import {
  applyMercadoPagoOrderStatus,
  createMercadoPagoCardIntent,
  createMercadoPagoPixIntent,
  MercadoPagoPaymentServiceError,
  shouldRefundMercadoPagoPaymentBeforeDispatch,
} from './payments/mercado-pago-payment-service.js';
import {
  applyMercadoPagoWalletTopupOrderStatus,
  createMercadoPagoWalletPixTopup,
  MercadoPagoWalletTopupError,
} from './payments/mercado-pago-wallet-topup-service.js';
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
  passengerWalletBalanceCents,
  payRideWithWallet,
} from './payments/wallet-services.js';
import { WalletDomainError } from './payments/wallet.js';
import { PayoutDomainError } from './payments/payout.js';
import {
  driverFinanceStatement,
  driverFinanceSummary,
  driverPayoutDestinationForApp,
  requestDriverPayoutFromApp,
  saveDriverPayoutDestinationFromApp,
} from './drivers/driver-finance-service.js';
import {
  InvalidDriverFinanceRequestError,
  parseDriverPayoutDestinationRequest,
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
import {
  loginPassengerWithPassword,
  PassengerPasswordAuthError,
  updatePassengerAccount,
} from './auth/passenger-password-auth-service.js';
import {
  MAX_PASSENGER_PROFILE_PHOTO_JSON_BYTES,
  PassengerProfilePhotoError,
  passengerPhotoPath,
  readPassengerProfilePhoto,
  updatePassengerProfilePhoto,
} from './auth/passenger-profile-photo-service.js';
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
  encodeAdminAuditCursor,
  encodeAdminIdentityDirectoryCursor,
  encodeAdminRideDirectoryCursor,
  parseAdminAuditQuery,
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
  canDriverReceiveNewWork,
} from './drivers/driver-operational-eligibility.js';
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
  submitDriverDocumentFromDriverApp,
} from './drivers/driver-document-service.js';
import {
  InvalidDriverDocumentRequestError,
  parseReviewDriverDocumentRequest,
  parseSubmitDriverDocumentRequest,
} from './drivers/driver-document-validation.js';
import {
  DriverDocumentInspectionError,
  issueDriverDocumentInspection,
  readDriverDocumentInspection,
  resolveDocumentInspectionEncryptionKey,
  resolveDocumentInspectionTtlSeconds,
} from './drivers/driver-document-inspection.js';
import {
  MAX_PRIVATE_DOCUMENT_BYTES,
  PrivateDocumentStorageError,
  createPrivateDocumentStorageFromEnv,
} from './drivers/driver-document-private-storage.js';
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
  cancelDriverRide,
  currentDriverRide,
  driverRideView,
  performDriverRideAction,
} from './drivers/driver-ride-service.js';
import {
  driverActivityForApp,
  driverProfileForApp,
} from './drivers/driver-self-service.js';
import {
  DriverSupportError,
  createDriverSupportTicket,
  createPassengerSupportTicket,
  listDriverSupportTickets,
  listPassengerSupportTickets,
  listSupportTicketsForAdmin,
  respondToSupportTicket,
} from './drivers/driver-support-service.js';
import {
  DriverProfilePhotoError,
  MAX_DRIVER_PROFILE_PHOTO_JSON_BYTES,
  driverPhotoPath,
  readDriverProfilePhoto,
  updateDriverProfilePhoto,
} from './drivers/driver-profile-photo-service.js';
import { nearbyDriversForApp } from './drivers/driver-nearby-service.js';
import { RideOfferError } from './matching/ride-offer.js';
import { createRide, RideCreationError } from './rides/create-ride.js';
import { passengerRideView } from './rides/passenger-ride-view.js';
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
import { adminFleetSnapshot } from './admin/admin-fleet-service.js';
import { adminFinanceView } from './admin/admin-finance-service.js';
import {
  AdminPayoutOwnerAuthorizationError,
  assertAdminPayoutOwner,
} from './admin/admin-payout-owner-authorization.js';
import {
  AdminPayoutError,
  adminPayoutDetailView,
  approveAdminPayout,
  cancelAdminPayout,
  completeAdminPayout,
  createAdminManualPayoutBatch,
  getAdminPayoutDetail,
  updateAdminPayoutAutomaticMode,
} from './admin/admin-payout-service.js';
import { adminIntegrationSetupView } from './admin/admin-integrations-service.js';
import {
  AdminPaymentPolicyError,
  adminPaymentPolicyView,
  updateAdminPaymentPolicy,
} from './admin/admin-payment-policy-service.js';
import {
  AdminOperationalSettingsError,
  adminOperationalSettingsView,
  updateAdminOperationalSettings,
} from './admin/admin-operational-settings-service.js';
import {
  AdminDriverDocumentComplianceError,
  adminDriverDocumentComplianceView,
  decideDriverDocumentCompliance,
  listAdminDriverDocumentComplianceAlerts,
  notifyDriverDocumentCompliance,
} from './admin/admin-driver-document-compliance-service.js';
import {
  AdminDriverCashPolicyError,
  adminDriverCashPolicyView,
  setAdminDriverCashDebtLimit,
} from './admin/admin-driver-cash-policy-service.js';
import {
  AdminPassengerError,
  adminPassengerNotificationsView,
  adminPassengerProfile,
  adminPassengerWalletView,
  setPassengerAuthStatusFromAdmin,
  updatePassengerProfileFromAdmin,
} from './admin/admin-passenger-service.js';
import {
  AdminRideCancellationError,
  cancelRideFromAdmin,
} from './admin/admin-ride-cancellation-service.js';
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
import {
  createRoutingDistanceProviderFromEnv,
  createRoutingRouteProviderFromEnv,
} from './routing/routing-provider-factory.js';
import {
  GooglePlacesError,
  createGooglePlacesServiceFromEnv,
} from './places/google-places-service.js';
import {
  isApprovedExternalPlaceDetails,
  isApprovedExternalPlacesQuery,
  placesLocalityId,
} from './places/places-access-policy.js';
import { resolveApprovedLocalPlace } from './places/local-place-policy.js';
import { assertCatalogLocationSupported } from './pricing/catalog-location-policy.js';
import {
  issuePlaceProof,
  PlaceProofError,
  resolvePlaceProofSecret,
  resolvePlaceProofTtlSeconds,
  verifyPlaceProof,
} from './places/place-proof.js';
import { RoutingRouteError } from './routing/route-provider.js';
import {
  confirmRidePayment,
  RidePaymentConfirmationError,
} from './rides/confirm-payment.js';
import { authorizeCashRide } from './rides/authorize-cash.js';
import { dispatchRideAfterPayment } from './rides/dispatch-after-payment.js';
import {
  refundWalletRide,
  refundWalletRideAfterNoDriver,
  RideRefundError,
} from './rides/refund-no-driver.js';
import {
  ExternalRideRefundError,
  refundMercadoPagoRide,
  refundMercadoPagoRideAfterNoDriver,
} from './rides/refund-external-no-driver.js';
import { passengerRideTracking } from './rides/passenger-ride-tracking.js';
import { automaticallyRefundRide } from './rides/automatic-ride-refund-service.js';
import {
  expireNoDriverDecisions,
  reconcilePendingRideRefunds,
} from './rides/no-driver-decision-timeout-service.js';
import {
  cancelPassengerRideAfterNoDriver,
  PassengerRideRecoveryError,
  retryPassengerRideSearch,
} from './rides/passenger-ride-recovery-service.js';
import {
  DriverRatingError,
  submitPassengerDriverRating,
} from './rides/driver-rating-service.js';
import { passengerActivityForApp } from './rides/passenger-activity-service.js';
import {
  PassengerSavedPlaceError,
  deletePassengerSavedPlace,
  listPassengerSavedPlaces,
  savePassengerSavedPlace,
} from './passengers/passenger-saved-place-service.js';
import { transitionRide } from './rides/ride-state.js';
import { RealtimeHub } from './realtime/realtime-hub.js';
import { attachRealtimeServer } from './realtime/realtime-server.js';
import {
  assertGoogleMapsProductionConfig,
  assertMercadoPagoProductionConfig,
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
  readBinaryBody,
  readJsonBody as readJson,
} from './http/request-body.js';
import {
  registerPushDevice,
  pushDevicePublicView,
  PushNotificationService,
} from './notifications/push-notification-service.js';
import {
  PushDeviceValidationError,
  parsePushDeviceRegistration,
} from './notifications/push-device-validation.js';
import { resolvePushDeliveryProviderFromEnv } from './notifications/push-delivery-provider.js';
import {
  AdminCommunicationsError,
  adminCommunicationsView,
  getPublicAgencyTour,
  listPublicAgencyTours,
  notifyRegisteredDeviceIfOutdated,
  releasePolicyView,
  sendAdminNotification,
  updateAgencyPromotion,
  updateAgencyTour,
  updateAgencyTourCover,
  updateAppAuthHero,
  updateAppReleasePolicy,
  updateSocialLinks,
} from './admin/admin-communications-service.js';
import {
  PrivacyError,
  acceptCurrentLegalDocument,
  createDataSubjectRequest,
  listPrivacyRequestsForAdmin,
  privacyOverview,
  publicLegalDocuments,
  publishLegalDocument,
  updatePrivacyPreferences,
  updatePrivacyRequestFromAdmin,
} from './privacy/privacy-service.js';
import {
  InvalidCommunicationsRequestError,
  parseAdminAgencyPromotionUpdate,
  parseAdminAgencyTourUpdate,
  parseAdminNotificationBroadcast,
  parseAdminSocialLinksUpdate,
  parseAdminReleasePolicyUpdate,
  parseAgencyTourSlug,
  parseAppKind,
  parsePublicReleasePolicyQuery,
  parsePushPlatform,
} from './admin/admin-communications-validation.js';

const port = resolveCorePort();
const {
  authSessionRepository,
  authOtpRepository,
  adminRepository,
  adminHumanAuthRepository,
  rideRepository,
  financeRepository,
  paymentPolicySettingsRepository,
  driverSupplyRepository,
  driverRegistryRepository,
  driverDocumentRepository,
  driverDocumentComplianceRepository,
  driverSupportRepository,
  pricingCatalogVersionRepository,
  ridePreparationRepository,
  rideMatchingRepository,
  pushDeviceRepository,
  adminCommunicationsRepository,
  operationalSettingsRepository,
  passengerSavedPlaceRepository,
  privacyRepository,
  storageMode,
  readinessCheck,
  close: closeRepositories,
} = createRepositories();
const routingDistanceProvider = createRoutingDistanceProviderFromEnv();
const routingRouteProvider = createRoutingRouteProviderFromEnv();
const googlePlacesService = createGooglePlacesServiceFromEnv();
const placeProofSecret = resolvePlaceProofSecret();
const placeProofTtlSeconds = resolvePlaceProofTtlSeconds();
assertGoogleMapsProductionConfig();
assertMercadoPagoProductionConfig();
const mercadoPagoOrdersClient = mercadoPagoOrdersClientFromEnv();
const driverPayoutProvider = createDriverPayoutProviderFromEnv();
const realtimeHub = new RealtimeHub();
const otpDeliveryProvider = resolveOtpDeliveryProviderFromEnv();
const pushNotificationService = new PushNotificationService(
  pushDeviceRepository,
  resolvePushDeliveryProviderFromEnv(),
);
resolveOtpHashSecret();
const authRateLimitSecret = resolveOtpRateLimitSecret();
const adminMfaEncryptionKey = resolveAdminMfaEncryptionKey();
const adminLoginRateLimitSecret = resolveAdminLoginRateLimitSecret();
const privateDocumentStorage = createPrivateDocumentStorageFromEnv();
const documentInspectionEncryptionKey =
  privateDocumentStorage == null
    ? null
    : resolveDocumentInspectionEncryptionKey();
const documentInspectionTtlSeconds =
  privateDocumentStorage == null
    ? 60
    : resolveDocumentInspectionTtlSeconds();

async function driverDocumentPolicy(
  driverId: string,
): Promise<{
  enforceDocuments: boolean;
  manualDocumentBlocked: boolean;
}> {
  const [settings, control] = await Promise.all([
    operationalSettingsRepository.get(),
    driverDocumentComplianceRepository.get(driverId),
  ]);
  return {
    enforceDocuments: settings.driverDocumentAutoEnforcement === true,
    manualDocumentBlocked: control?.manualBlocked === true,
  };
}

async function canDriverReceiveNewWorkUnderPolicy(
  driverId: string,
  now?: Date,
): Promise<boolean> {
  const policy = await driverDocumentPolicy(driverId);
  return canDriverReceiveNewWork({
    registry: driverRegistryRepository,
    documents: driverDocumentRepository,
    driverId,
    ...policy,
    ...(now == null ? {} : { now }),
  });
}

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

const MAX_AGENCY_TOUR_COVER_BYTES = 8 * 1024 * 1024;
const MAX_APP_AUTH_HERO_BYTES = 5 * 1024 * 1024;

function hasValidImageMagic(
  bytes: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

const RIDE_CHAT_READABLE_STATES = new Set([
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
]);

const RIDE_CHAT_WRITABLE_STATES = new Set([
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
]);

function parseRideChatBody(input: unknown): string {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('RIDE_CHAT_BODY_INVALID');
  }
  const raw = (input as Record<string, unknown>).body;
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (body.length < 1 || body.length > 1000) {
    throw new Error('RIDE_CHAT_BODY_INVALID');
  }
  return body;
}


async function resolvePlacesLocalOnly(input: {
  query: string;
  requestedLocalOnly: boolean;
}): Promise<boolean | null> {
  if (input.requestedLocalOnly) return true;

  const pricing = await resolvePricingCatalogContext({
    versions: pricingCatalogVersionRepository,
    at: new Date(),
  });
  return isApprovedExternalPlacesQuery({
    query: input.query,
    externalLocalities: pricing.snapshot.externalLocalities,
  })
    ? false
    : null;
}

async function externalPlacesCatalog(): Promise<string[]> {
  const pricing = await resolvePricingCatalogContext({
    versions: pricingCatalogVersionRepository,
    at: new Date(),
  });
  return pricing.snapshot.externalLocalities;
}

async function externalPlacesLocalityAllowed(
  localityId: string,
): Promise<boolean> {
  const normalized = localityId.trim();
  if (!normalized) return false;
  return (await externalPlacesCatalog()).includes(normalized);
}

function parseRoutePoint(value: unknown):
  | { latitude: number; longitude: number }
  | null {
  if (value == null || typeof value !== 'object') return null;
  const record = value as {
    latitude?: unknown;
    longitude?: unknown;
  };
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function sendPushBestEffort(input: {
  subjectType: 'passenger' | 'driver';
  subjectId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): void {
  void pushNotificationService.notifySubject({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    message: {
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.data == null ? {} : { data: input.data }),
    },
  }).catch((pushError) => {
    logWarn('push.delivery.failed', {
      type: input.type,
      ...errorFields(pushError),
    });
  });
}

async function releaseExpiredPreparedDriverHold(input: {
  rideId: string;
  driverId?: string;
  now: Date;
}): Promise<void> {
  const driverId = input.driverId?.trim();
  if (!driverId) return;

  const supply = await driverSupplyRepository.findByDriverId(driverId);
  if (
    supply == null ||
    supply.reservedRideId !== input.rideId ||
    supply.reservedUntil == null ||
    Date.parse(supply.reservedUntil) > input.now.getTime()
  ) {
    return;
  }

  const {
    reservedRideId: _reservedRideId,
    reservedUntil: _reservedUntil,
    ...released
  } = supply;

  await driverSupplyRepository.upsert({
    ...released,
    updatedAt: input.now.toISOString(),
  });
}


async function processConfirmedMercadoPagoRide(
  payment: PaymentRecord,
): Promise<void> {
  const confirmationTime = new Date();
  const rideBeforeConfirmation =
    await rideRepository.findById(payment.rideId);
  const expiredHold =
    rideBeforeConfirmation != null &&
    shouldRefundMercadoPagoPaymentBeforeDispatch(
      rideBeforeConfirmation,
      confirmationTime,
    );

  let ride = await confirmRidePayment(rideRepository, {
    rideId: payment.rideId,
    payment,
    confirmedAt: confirmationTime,
    notifyPassenger: !expiredHold,
  });

  if (expiredHold) {
    logWarn('ride.payment.confirmed_after_hold_expired', {
      rideId: ride.id,
      paymentId: payment.id,
      driverHoldExpiresAt:
        rideBeforeConfirmation?.driverHoldExpiresAt ?? null,
    });

    await releaseExpiredPreparedDriverHold({
      rideId: ride.id,
      ...(rideBeforeConfirmation?.reservedDriverId == null
        ? {}
        : { driverId: rideBeforeConfirmation.reservedDriverId }),
      now: confirmationTime,
    });

    const refund = await refundMercadoPagoRideAfterNoDriver({
      rides: rideRepository,
      finance: financeRepository,
      gateway: mercadoPagoOrdersClient!,
      rideId: ride.id,
      paymentId: payment.id,
      passengerId: ride.passengerId,
      now: confirmationTime,
    });

    if (refund.ride.state === 'REFUND_PENDING') {
      sendPushBestEffort({
        subjectType: 'passenger',
        subjectId: refund.ride.passengerId,
        type: 'passenger.payment.refund_pending',
        title: 'Reserva expirada',
        body:
          'Seu Pix foi recebido após a reserva expirar. ' +
          'O estorno já foi solicitado.',
        data: { rideId: refund.ride.id },
      });
    }
    return;
  }

  if (
    ride.state === 'REFUNDED' ||
    ride.state === 'REFUND_PENDING' ||
    ride.state === 'NO_DRIVER_FOUND'
  ) {
    if (ride.state === 'REFUND_PENDING') {
      await refundMercadoPagoRide({
        rides: rideRepository,
        finance: financeRepository,
        gateway: mercadoPagoOrdersClient!,
        rideId: ride.id,
        paymentId: payment.id,
        passengerId: ride.passengerId,
      });
    }
    return;
  }

  if (
    ride.state === 'DRIVER_ASSIGNED' ||
    ride.state === 'DRIVER_ARRIVING' ||
    ride.state === 'DRIVER_ARRIVED' ||
    ride.state === 'IN_PROGRESS' ||
    ride.state === 'COMPLETED' ||
    ride.state === 'SEARCHING_DRIVER'
  ) {
    return;
  }

  let dispatch:
    | Awaited<ReturnType<typeof dispatchRideAfterPayment>>
    | undefined;
  try {
    dispatch = await dispatchRideAfterPayment({
      ride,
      rides: rideRepository,
      drivers: driverSupplyRepository,
      matching: rideMatchingRepository,
      finance: financeRepository,
      paymentPolicySettings: paymentPolicySettingsRepository,
      operationalSettings: operationalSettingsRepository,
      canOfferDriver: (candidateDriverId) =>
        canDriverReceiveNewWorkUnderPolicy(candidateDriverId),
    });
  } catch (dispatchError) {
    logError('ride.dispatch.after_gateway_payment.failed', {
      rideId: ride.id,
      paymentId: payment.id,
      ...errorFields(dispatchError),
    });
    return;
  }

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
    return;
  }

  if (dispatch.kind === 'NOT_PREPARED') {
    await refundMercadoPagoRide({
      rides: rideRepository,
      finance: financeRepository,
      gateway: mercadoPagoOrdersClient!,
      rideId: ride.id,
      paymentId: payment.id,
      passengerId: ride.passengerId,
    });
  }
}
async function markMercadoPagoRidePaymentFailed(
  payment: PaymentRecord,
): Promise<void> {
  const ride = await rideRepository.findById(payment.rideId);
  if (ride == null) return;

  if (ride.state === 'PAYMENT_FAILED') {
    if (ride.paymentStatus !== payment.status) {
      await rideRepository.save({
        ...ride,
        paymentStatus: payment.status,
        paymentMethod: payment.method,
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (ride.state !== 'AWAITING_PAYMENT') {
    logWarn('ride.payment.failure_after_state_advanced', {
      rideId: ride.id,
      rideState: ride.state,
      paymentId: payment.id,
      paymentStatus: payment.status,
    });
    return;
  }

  const failedRide = await rideRepository.save({
    ...ride,
    state: transitionRide(ride.state, 'PAYMENT_FAILED'),
    paymentStatus: payment.status,
    paymentMethod: payment.method,
    updatedAt: new Date().toISOString(),
  });

  sendPushBestEffort({
    subjectType: 'passenger',
    subjectId: failedRide.passengerId,
    type: 'passenger.payment.failed',
    title: 'Pagamento não aprovado',
    body: 'Não foi possível confirmar o pagamento. Tente novamente.',
    data: { rideId: failedRide.id },
  });
}

async function finalizeMercadoPagoRefundedRide(
  payment: PaymentRecord,
): Promise<void> {
  let ride = await rideRepository.findById(payment.rideId);
  if (ride == null || ride.state === 'REFUNDED') return;

  const instant = new Date().toISOString();

  if (
    ride.state === 'PAID' ||
    ride.state === 'SEARCHING_DRIVER' ||
    ride.state === 'DRIVER_ASSIGNED' ||
    ride.state === 'DRIVER_ARRIVING' ||
    ride.state === 'DRIVER_ARRIVED'
  ) {
    const operational = await rideMatchingRepository.cancelRideByAdmin({
      rideId: ride.id,
      cancelledAt: instant,
    });
    ride = operational.ride;

    if (operational.releasedDriverId != null) {
      sendPushBestEffort({
        subjectType: 'driver',
        subjectId: operational.releasedDriverId,
        type: 'driver.ride.cancelled_after_refund',
        title: 'Corrida cancelada',
        body: 'Esta corrida foi cancelada após o estorno do pagamento.',
        data: { rideId: ride.id },
      });
    }
  }

  if (
    ride.state === 'NO_DRIVER_FOUND' ||
    ride.state === 'CANCELLED_BY_PASSENGER' ||
    ride.state === 'CANCELLED_BY_DRIVER' ||
    ride.state === 'CANCELLED_BY_ADMIN'
  ) {
    ride = await rideRepository.save({
      ...ride,
      state: transitionRide(ride.state, 'REFUND_PENDING'),
      updatedAt: instant,
    });
  }

  if (ride.state !== 'REFUND_PENDING') {
    logWarn('ride.gateway_refund.requires_manual_reconciliation', {
      rideId: ride.id,
      rideState: ride.state,
      paymentId: payment.id,
    });
    return;
  }

  const refundedRide = await rideRepository.save({
    ...ride,
    state: transitionRide(ride.state, 'REFUNDED'),
    paymentStatus: 'refunded',
    paymentMethod: payment.method,
    updatedAt: instant,
  });

  sendPushBestEffort({
    subjectType: 'passenger',
    subjectId: refundedRide.passengerId,
    type: 'passenger.payment.refunded',
    title: 'Estorno concluído',
    body: 'O valor da corrida foi devolvido pelo Mercado Pago.',
    data: { rideId: refundedRide.id },
  });
}

let shuttingDown = false;
let payoutReconciliationRunning = false;
let payoutReconciliationTimer: ReturnType<typeof setInterval> | null = null;
let lastScheduledPayoutCycleDate: string | null = null;
let noDriverDecisionSweepRunning = false;
let noDriverDecisionSweepTimer: ReturnType<typeof setInterval> | null = null;

function payoutReconciliationIntervalMs(): number {
  const raw = process.env.DRIVER_PAYOUT_RECONCILE_INTERVAL_SECONDS?.trim();
  const seconds = raw == null || raw === '' ? 60 : Number(raw);
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 3600) {
    return 60_000;
  }
  return seconds * 1000;
}

async function runPayoutReconciliation(): Promise<void> {
  if (
    driverPayoutProvider == null ||
    payoutReconciliationRunning ||
    shuttingDown
  ) {
    return;
  }

  payoutReconciliationRunning = true;
  try {
    const cycleDate = scheduledDriverPayoutCycleDate(new Date());
    if (
      cycleDate != null &&
      cycleDate !== lastScheduledPayoutCycleDate
    ) {
      const scheduled = await createScheduledDriverPayouts({
        finance: financeRepository,
        limit: 500,
      });
      lastScheduledPayoutCycleDate = cycleDate;

      for (const payout of scheduled.created) {
        try {
          await processDriverPayout({
            finance: financeRepository,
            provider: driverPayoutProvider,
            payoutId: payout.id,
          });
        } catch (error) {
          logWarn('driver.payout.scheduled_provider_retry_pending', {
            payoutId: payout.id,
            driverId: payout.driverId,
            ...errorFields(error),
          });
        }
      }

      if (
        scheduled.created.length > 0 ||
        scheduled.skippedNoPix > 0
      ) {
        logInfo('driver.payout.scheduled_cycle.completed', {
          cycleDate,
          automaticEnabled: scheduled.automaticEnabled,
          created: scheduled.created.length,
          skippedNoPix: scheduled.skippedNoPix,
          skippedIdempotent: scheduled.skippedIdempotent,
        });
      }
    }

    const result = await reconcileDriverPayouts({
      finance: financeRepository,
      provider: driverPayoutProvider,
      limit: 100,
    });
    if (result.processed > 0 || result.errors > 0) {
      logInfo('driver.payout.reconciliation.completed', result);
    }
  } catch (error) {
    logWarn('driver.payout.reconciliation.failed', errorFields(error));
  } finally {
    payoutReconciliationRunning = false;
  }
}

async function runNoDriverDecisionSweep(): Promise<void> {
  if (noDriverDecisionSweepRunning || shuttingDown) return;

  noDriverDecisionSweepRunning = true;
  try {
    const onFailure = (failure: {
      rideId: string;
      passengerId: string;
      error: unknown;
    }) => {
      logWarn('ride.refund.sweep_item_failed', {
        rideId: failure.rideId,
        passengerId: failure.passengerId,
        ...errorFields(failure.error),
      });
    };

    const expired = await expireNoDriverDecisions({
      rides: rideRepository,
      finance: financeRepository,
      operationalSettings: operationalSettingsRepository,
      gateway: mercadoPagoOrdersClient,
      limit: 100,
      onFailure,
    });
    const reconciled = await reconcilePendingRideRefunds({
      rides: rideRepository,
      finance: financeRepository,
      gateway: mercadoPagoOrdersClient,
      limit: 100,
      onFailure,
    });

    for (const result of expired) {
      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rideId: result.rideId,
        passengerId: result.passengerId,
      });
      if (tracking != null) {
        realtimeHub.publishPassengerRide(result.rideId, {
          type: 'passenger.ride.tracking',
          tracking,
          serverTime: new Date().toISOString(),
        });
      }

      sendPushBestEffort({
        subjectType: 'passenger',
        subjectId: result.passengerId,
        type: 'passenger.ride.no_driver_timeout',
        title: 'Busca encerrada',
        body:
          result.refundStatus === 'refunded'
            ? 'A busca ficou sem resposta e o pagamento foi devolvido.'
            : result.refundStatus === 'not_charged'
              ? 'A busca foi encerrada automaticamente. Nenhum valor foi cobrado.'
              : 'A busca foi encerrada e o reembolso está em processamento.',
        data: { rideId: result.rideId },
      });
    }

    for (const result of reconciled) {
      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rideId: result.rideId,
        passengerId: result.passengerId,
      });
      if (tracking != null) {
        realtimeHub.publishPassengerRide(result.rideId, {
          type: 'passenger.ride.tracking',
          tracking,
          serverTime: new Date().toISOString(),
        });
      }

      if (result.refundStatus === 'refunded') {
        sendPushBestEffort({
          subjectType: 'passenger',
          subjectId: result.passengerId,
          type: 'passenger.payment.refunded',
          title: 'Reembolso concluído',
          body: 'A devolução do pagamento da sua corrida foi confirmada.',
          data: { rideId: result.rideId },
        });
      }
    }

    if (expired.length > 0 || reconciled.length > 0) {
      logInfo('ride.refund.sweep_completed', {
        expiredNoDriver: expired.length,
        reconciledRefunds: reconciled.length,
      });
    }
  } catch (error) {
    logWarn(
      'ride.no_driver_decision.sweep_failed',
      errorFields(error),
    );
  } finally {
    noDriverDecisionSweepRunning = false;
  }
}

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
      requestUrl.pathname === '/v1/webhooks/mercado-pago/orders'
    ) {
      const orderId = requestUrl.searchParams.get('data.id')?.trim() ?? '';
      const topic = requestUrl.searchParams.get('type')?.trim() ?? '';
      const xSignature = headerValue(request, 'x-signature') ?? '';
      const xRequestId = headerValue(request, 'x-request-id') ?? '';
      const secret =
        process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '';

      if (
        topic !== 'order' ||
        !orderId ||
        !xSignature ||
        !xRequestId
      ) {
        json(response, 400, {
          error: 'INVALID_MERCADO_PAGO_WEBHOOK',
          message: 'Notificação do Mercado Pago incompleta.',
        });
        return;
      }

      if (!secret || mercadoPagoOrdersClient == null) {
        json(response, 503, {
          error: 'MERCADO_PAGO_NOT_CONFIGURED',
          message: 'Webhook do Mercado Pago ainda não está configurado.',
        });
        return;
      }

      if (
        !verifyMercadoPagoWebhookSignature({
          xSignature,
          xRequestId,
          dataId: orderId,
          secret,
        })
      ) {
        json(response, 401, {
          error: 'INVALID_MERCADO_PAGO_SIGNATURE',
        });
        return;
      }

      const order = await mercadoPagoOrdersClient.getOrder(orderId);
      const topup = await financeRepository.findWalletTopupById(
        order.externalReference.trim(),
      );

      if (topup != null) {
        const appliedTopup =
          await applyMercadoPagoWalletTopupOrderStatus({
            finance: financeRepository,
            order,
          });

        if (appliedTopup.kind === 'partially_refunded') {
          logWarn('wallet.topup.partial_refund_detected', {
            walletTopupId: appliedTopup.topup.id,
            passengerId: appliedTopup.topup.passengerId,
            orderId,
          });
        }

        json(response, 200, {
          received: true,
          orderId,
          resource: 'wallet_topup',
          status: appliedTopup.kind,
        });
        return;
      }

      const applied = await applyMercadoPagoOrderStatus({
        finance: financeRepository,
        order,
      });

      if (applied.kind === 'paid') {
        await processConfirmedMercadoPagoRide(applied.payment);
      } else if (
        applied.kind === 'failed' ||
        applied.kind === 'cancelled'
      ) {
        await markMercadoPagoRidePaymentFailed(applied.payment);
      } else if (applied.kind === 'refunded') {
        await finalizeMercadoPagoRefundedRide(applied.payment);
      } else if (applied.kind === 'partially_refunded') {
        logWarn('payment.mercado_pago.partial_refund_detected', {
          paymentId: applied.payment.id,
          rideId: applied.payment.rideId,
          orderId,
        });
      }

      json(response, 200, {
        received: true,
        orderId,
        resource: 'ride_payment',
        status: applied.kind,
      });
      return;
    }

    const driverPhotoMatch =
      requestUrl.pathname.match(/^\/v1\/drivers\/([^/]+)\/photo$/);
    if (request.method === 'GET' && driverPhotoMatch != null) {
      let driverId = '';
      try {
        driverId = decodeURIComponent(driverPhotoMatch[1] ?? '').trim();
      } catch {
        json(response, 400, { error: 'INVALID_DRIVER_ID' });
        return;
      }
      if (!driverId) {
        json(response, 400, { error: 'INVALID_DRIVER_ID' });
        return;
      }

      const photo = await readDriverProfilePhoto({
        registry: driverRegistryRepository,
        driverId,
      });
      if (photo == null) {
        json(response, 404, {
          error: 'DRIVER_PHOTO_NOT_FOUND',
          message: 'Foto do motorista não encontrada.',
        });
        return;
      }

      response.writeHead(200, {
        'content-type': photo.mimeType,
        'content-length': String(photo.bytes.length),
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      });
      response.end(photo.bytes);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/app/release-policy'
    ) {
      const query = parsePublicReleasePolicyQuery(
        requestUrl.searchParams,
      );
      const policy =
        await adminCommunicationsRepository.getReleasePolicy(
          query.appKind,
          query.platform,
        );
      json(
        response,
        200,
        releasePolicyView(policy, query.buildNumber),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/content/agency-promotion'
    ) {
      const promotion =
        await adminCommunicationsRepository.getAgencyPromotion();
      json(response, 200, promotion);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/content/social-links'
    ) {
      json(
        response,
        200,
        await adminCommunicationsRepository.getSocialLinks(),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/legal/documents'
    ) {
      json(
        response,
        200,
        await publicLegalDocuments({ repository: privacyRepository }),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/content/tours'
    ) {
      json(response, 200, {
        tours: await listPublicAgencyTours({
          communications: adminCommunicationsRepository,
        }),
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/content/app-auth-branding'
    ) {
      const branding = await adminCommunicationsRepository.getAppAuthBranding();
      json(response, 200, {
        ...branding,
        heroImageUrl: branding.heroImageVersion > 0
          ? `/v1/content/app-auth-branding/hero?v=${branding.heroImageVersion}`
          : null,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/content/app-auth-branding/hero'
    ) {
      const hero = await adminCommunicationsRepository.readAppAuthHero();
      if (hero == null) {
        json(response, 404, { error: 'APP_AUTH_HERO_NOT_FOUND', message: 'Imagem de login não configurada.' });
        return;
      }
      response.writeHead(200, {
        'content-type': hero.mimeType,
        'content-length': String(hero.bytes.byteLength),
        'cache-control': 'public, max-age=60, must-revalidate',
        'x-content-type-options': 'nosniff',
      });
      response.end(Buffer.from(hero.bytes));
      return;
    }

    const publicTourCoverMatch = requestUrl.pathname.match(
      /^\/v1\/content\/tours\/([^/]+)\/cover$/,
    );
    if (
      request.method === 'GET' &&
      publicTourCoverMatch != null
    ) {
      const slug = parseAgencyTourSlug(
        decodeURIComponent(publicTourCoverMatch[1] ?? ''),
      );
      const tour = await adminCommunicationsRepository.getTour(slug);
      if (tour == null || !tour.enabled) {
        json(response, 404, {
          error: 'TOUR_NOT_FOUND',
          message: 'Passeio não encontrado.',
        });
        return;
      }
      const cover = await adminCommunicationsRepository.readTourCover(slug);
      if (cover == null) {
        json(response, 404, {
          error: 'TOUR_COVER_NOT_FOUND',
          message: 'Foto do passeio não encontrada.',
        });
        return;
      }
      response.writeHead(200, {
        'content-type': cover.mimeType,
        'content-length': String(cover.bytes.byteLength),
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      });
      response.end(Buffer.from(cover.bytes));
      return;
    }

    const publicTourMatch = requestUrl.pathname.match(
      /^\/v1\/content\/tours\/([^/]+)$/,
    );
    if (
      request.method === 'GET' &&
      publicTourMatch != null
    ) {
      const slug = parseAgencyTourSlug(
        decodeURIComponent(publicTourMatch[1] ?? ''),
      );
      const tour = await getPublicAgencyTour({
        communications: adminCommunicationsRepository,
        slug,
      });
      if (tour == null) {
        json(response, 404, {
          error: 'TOUR_NOT_FOUND',
          message: 'Passeio não encontrado.',
        });
        return;
      }
      json(response, 200, { tour });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/maps/places/autocomplete'
    ) {
      const authorization = headerValue(request, 'authorization');
      if (process.env.NODE_ENV === 'production' || authorization != null) {
        await authenticateBearer({
          repository: authSessionRepository,
          identities: authOtpRepository,
          headers: request.headers,
        });
      }

      if (googlePlacesService == null) {
        json(response, 503, {
          error: 'PLACES_NOT_CONFIGURED',
          message: 'O serviço de busca de lugares ainda não está configurado.',
        });
        return;
      }

      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      try {
        const query =
          typeof value.input === 'string' ? value.input : '';
        const localOnly = await resolvePlacesLocalOnly({
          query,
          requestedLocalOnly: value.localOnly !== false,
        });
        if (localOnly == null) {
          json(response, 422, {
            error: 'EXTERNAL_DESTINATION_NOT_APPROVED',
            message:
              'Essa busca externa não pertence ao catálogo comercial vigente.',
          });
          return;
        }

        const suggestions = await googlePlacesService.autocomplete({
          query,
          sessionToken:
            typeof value.sessionToken === 'string'
              ? value.sessionToken
              : '',
          localOnly,
        });
        const safeSuggestions = localOnly
          ? suggestions
          : suggestions.filter(
              (suggestion) =>
                placesLocalityId(suggestion.mainText) ===
                placesLocalityId(query),
            );
        json(response, 200, {
          provider: 'google',
          suggestions: safeSuggestions,
        });
      } catch (error) {
        if (error instanceof GooglePlacesError) {
          const invalidRequest =
            error.code === 'INVALID_QUERY' ||
            error.code === 'INVALID_SESSION' ||
            error.code === 'INVALID_PLACE_ID' ||
            error.code === 'OUTSIDE_LOCAL_AREA';
          json(
            response,
            invalidRequest ? 422 : 503,
            {
              error: error.code,
              message: error.message,
            },
          );
          return;
        }
        throw error;
      }
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/maps/places/details'
    ) {
      const authorization = headerValue(request, 'authorization');
      if (process.env.NODE_ENV === 'production' || authorization != null) {
        await authenticateBearer({
          repository: authSessionRepository,
          identities: authOtpRepository,
          headers: request.headers,
        });
      }

      if (googlePlacesService == null) {
        json(response, 503, {
          error: 'PLACES_NOT_CONFIGURED',
          message: 'O serviço de busca de lugares ainda não está configurado.',
        });
        return;
      }

      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      try {
        const localOnly = value.localOnly !== false;
        const externalLocalityId =
          typeof value.externalLocalityId === 'string'
            ? value.externalLocalityId.trim()
            : '';
        let externalLocalities: string[] = [];

        if (!localOnly) {
          externalLocalities = await externalPlacesCatalog();
          if (
            !externalLocalityId ||
            !externalLocalities.includes(externalLocalityId)
          ) {
            json(response, 422, {
              error: 'EXTERNAL_DESTINATION_NOT_APPROVED',
              message:
                'Esse destino externo não pertence ao catálogo comercial vigente.',
            });
            return;
          }
        }

        const place = await googlePlacesService.placeDetails({
          placeId:
            typeof value.placeId === 'string' ? value.placeId : '',
          sessionToken:
            typeof value.sessionToken === 'string'
              ? value.sessionToken
              : '',
          localOnly,
        });

        if (
          !localOnly &&
          !isApprovedExternalPlaceDetails({
            localityId: externalLocalityId,
            formattedAddress: place.address,
            addressComponentNames: place.addressComponentNames,
            externalLocalities,
          })
        ) {
          json(response, 422, {
            error: 'EXTERNAL_PLACE_MISMATCH',
            message:
              'O lugar selecionado não corresponde ao destino externo aprovado.',
          });
          return;
        }

        let approvedPricingLocation:
          | { zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external'; localityId: string }
          | null = null;

        if (localOnly) {
          const candidate = resolveApprovedLocalPlace({
            name: place.name,
            address: place.address,
            addressComponentNames: place.addressComponentNames,
          });
          if (candidate != null) {
            const pricing = await resolvePricingCatalogContext({
              versions: pricingCatalogVersionRepository,
              at: new Date(),
            });
            try {
              assertCatalogLocationSupported({
                catalog: pricing.snapshot,
                ref: candidate,
                field: 'destination',
              });
              approvedPricingLocation = candidate;
            } catch {
              approvedPricingLocation = null;
            }
          }
        } else {
          approvedPricingLocation = {
            zoneId: 'external',
            localityId: externalLocalityId,
          };
        }

        const proofLocalityId = approvedPricingLocation?.localityId;
        const placeProof = proofLocalityId == null
          ? undefined
          : issuePlaceProof({
              localityId: proofLocalityId,
              placeId: place.id,
              latitude: place.latitude,
              longitude: place.longitude,
              secret: placeProofSecret,
              ttlSeconds: placeProofTtlSeconds,
            });

        json(response, 200, {
          provider: 'google',
          place: {
            id: place.id,
            name: place.name,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            ...(placeProof == null ? {} : { placeProof }),
            ...(approvedPricingLocation == null
              ? {}
              : {
                  approvedPricingZoneId:
                    approvedPricingLocation.zoneId,
                  approvedPricingLocalityId:
                    approvedPricingLocation.localityId,
                }),
            ...(externalLocalityId
              ? { approvedExternalId: externalLocalityId }
              : {}),
          },
        });
      } catch (error) {
        if (error instanceof GooglePlacesError) {
          const invalidRequest =
            error.code === 'INVALID_QUERY' ||
            error.code === 'INVALID_SESSION' ||
            error.code === 'INVALID_PLACE_ID' ||
            error.code === 'OUTSIDE_LOCAL_AREA';
          json(
            response,
            invalidRequest ? 422 : 503,
            {
              error: error.code,
              message: error.message,
            },
          );
          return;
        }
        throw error;
      }
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/maps/places/search'
    ) {
      const authorization = headerValue(request, 'authorization');
      if (process.env.NODE_ENV === 'production' || authorization != null) {
        await authenticateBearer({
          repository: authSessionRepository,
          identities: authOtpRepository,
          headers: request.headers,
        });
      }

      if (googlePlacesService == null) {
        json(response, 503, {
          error: 'PLACES_NOT_CONFIGURED',
          message: 'O serviço de busca de lugares ainda não está configurado.',
        });
        return;
      }

      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      try {
        const query =
          typeof value.query === 'string' ? value.query : '';
        const localOnly = await resolvePlacesLocalOnly({
          query,
          requestedLocalOnly: value.localOnly !== false,
        });
        if (localOnly == null) {
          json(response, 422, {
            error: 'EXTERNAL_DESTINATION_NOT_APPROVED',
            message:
              'Essa busca externa não pertence ao catálogo comercial vigente.',
          });
          return;
        }

        const places = await googlePlacesService.searchText({
          query,
          localOnly,
        });
        const safePlaces = localOnly
          ? places
          : places.filter(
              (place) =>
                placesLocalityId(place.name) === placesLocalityId(query),
            );

        let responsePlaces = safePlaces;
        if (localOnly) {
          const pricing = await resolvePricingCatalogContext({
            versions: pricingCatalogVersionRepository,
            at: new Date(),
          });
          responsePlaces = safePlaces.map((place) => {
            const candidate = resolveApprovedLocalPlace({
              name: place.name,
              address: place.address,
            });
            if (candidate == null) return place;

            try {
              assertCatalogLocationSupported({
                catalog: pricing.snapshot,
                ref: candidate,
                field: 'destination',
              });
            } catch {
              return place;
            }

            return {
              ...place,
              approvedPricingZoneId: candidate.zoneId,
              approvedPricingLocalityId: candidate.localityId,
              placeProof: issuePlaceProof({
                localityId: candidate.localityId,
                placeId: place.id,
                latitude: place.latitude,
                longitude: place.longitude,
                secret: placeProofSecret,
                ttlSeconds: placeProofTtlSeconds,
              }),
            };
          });
        } else {
          const localityId = placesLocalityId(query);
          responsePlaces = safePlaces.map((place) => ({
            ...place,
            approvedExternalId: localityId,
            approvedPricingZoneId: 'external' as const,
            approvedPricingLocalityId: localityId,
            placeProof: issuePlaceProof({
              localityId,
              placeId: place.id,
              latitude: place.latitude,
              longitude: place.longitude,
              secret: placeProofSecret,
              ttlSeconds: placeProofTtlSeconds,
            }),
          }));
        }

        json(response, 200, {
          provider: 'google',
          places: responsePlaces,
        });
      } catch (error) {
        if (error instanceof GooglePlacesError) {
          json(
            response,
            error.code === 'INVALID_QUERY' ? 422 : 503,
            {
              error: error.code,
              message: error.message,
            },
          );
          return;
        }
        throw error;
      }
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/maps/route'
    ) {
      const authorization = headerValue(request, 'authorization');
      if (process.env.NODE_ENV === 'production' || authorization != null) {
        await authenticateBearer({
          repository: authSessionRepository,
          identities: authOtpRepository,
          headers: request.headers,
        });
      }

      if (routingRouteProvider == null) {
        json(response, 503, {
          error: 'ROUTING_NOT_CONFIGURED',
          message: 'O serviço de rotas ainda não está configurado.',
        });
        return;
      }

      const body = await readJson(request);
      const raw =
        body != null && typeof body === 'object'
          ? body as { origin?: unknown; destination?: unknown }
          : {};
      const origin = parseRoutePoint(raw.origin);
      const destination = parseRoutePoint(raw.destination);
      if (origin == null || destination == null) {
        json(response, 422, {
          error: 'INVALID_ROUTE_COORDINATES',
          message: 'Origem e destino precisam ter coordenadas válidas.',
        });
        return;
      }

      try {
        const route = await routingRouteProvider.route({
          from: origin,
          to: destination,
        });
        json(response, 200, {
          provider:
            process.env.ROUTING_PROVIDER?.trim().toLowerCase() ||
            'google',
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          points: route.points,
          maneuvers: route.maneuvers,
        });
      } catch (error) {
        if (error instanceof RoutingRouteError) {
          json(
            response,
            error.code === 'INVALID_COORDINATES'
              ? 422
              : error.code === 'ROUTE_NOT_FOUND'
                ? 404
                : 503,
            {
              error: error.code,
              message: error.message,
            },
          );
          return;
        }
        throw error;
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
      const email =
        body != null && typeof body === 'object' && 'email' in body
          ? String((body as { email?: unknown }).email ?? '')
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
        email,
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
      requestUrl.pathname === '/v1/auth/passenger/password/reset/request'
    ) {
      const body = await readJson(request);
      const phone =
        body != null && typeof body === 'object' && 'phone' in body
          ? String((body as { phone?: unknown }).phone ?? '')
          : '';

      const requested = await requestPhoneOtp({
        repository: authOtpRepository,
        delivery: otpDeliveryProvider,
        subjectType: 'passenger',
        phone,
        allowPassengerCreate: false,
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
      requestUrl.pathname === '/v1/auth/passenger/password/login'
    ) {
      const body = await readJson(request);
      const email =
        body != null && typeof body === 'object' && 'email' in body
          ? String((body as { email?: unknown }).email ?? '')
          : '';
      const password =
        body != null && typeof body === 'object' && 'password' in body
          ? String((body as { password?: unknown }).password ?? '')
          : '';

      const clientIp = requestClientIp(request);
      const clientInstanceId =
        headerValue(request, 'x-client-instance-id');
      const session = await loginPassengerWithPassword({
        identities: authOtpRepository,
        sessions: authSessionRepository,
        email,
        password,
        rateLimitSecret: authRateLimitSecret,
        ...(clientIp == null ? {} : { clientIp }),
        ...(clientInstanceId == null
          ? {}
          : { clientInstanceId }),
      });
      json(response, 201, session);
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
      const identity = await authOtpRepository.findIdentityBySubject(
        session.subjectType,
        session.subjectId,
      );
      json(response, 200, {
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        expiresAt: session.expiresAt,
        ...(identity?.emailNormalized == null
          ? {}
          : { email: identity.emailNormalized }),
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/passenger/me/activity'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,2}$/.test(rawLimit)
          ? 30
          : Math.max(1, Math.min(50, Number(rawLimit)));
      json(
        response,
        200,
        await passengerActivityForApp({
          rides: rideRepository,
          passengerId: session.subjectId,
          limit,
        }),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/passenger/me/photo'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const photo = await readPassengerProfilePhoto({
        identities: authOtpRepository,
        subjectId: session.subjectId,
      });
      if (photo == null) {
        json(response, 404, {
          error: 'PASSENGER_PHOTO_NOT_FOUND',
          message: 'Foto do passageiro não encontrada.',
        });
        return;
      }

      response.writeHead(200, {
        'content-type': photo.mimeType,
        'content-length': String(photo.bytes.length),
        'cache-control': 'private, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      });
      response.end(photo.bytes);
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/passenger/me/photo'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const body = await readJson(
        request,
        MAX_PASSENGER_PROFILE_PHOTO_JSON_BYTES,
      );
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      const identity = await updatePassengerProfilePhoto({
        identities: authOtpRepository,
        subjectId: session.subjectId,
        mimeType: value.mimeType,
        dataBase64: value.dataBase64,
      });

      json(response, 200, {
        subjectId: identity.subjectId,
        phoneE164: identity.phoneE164,
        email: identity.emailNormalized ?? null,
        fullName: identity.fullName ?? null,
        photoUrl:
          passengerPhotoPath(identity.photoUpdatedAt) ??
          identity.photoUrl ??
          null,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/passenger/me/account'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const identity = await authOtpRepository.findIdentityBySubject(
        'passenger',
        session.subjectId,
      );
      if (identity == null) {
        throw new PassengerPasswordAuthError(
          'PASSENGER_IDENTITY_NOT_FOUND',
          'Conta de passageiro não encontrada.',
        );
      }
      json(response, 200, {
        subjectId: identity.subjectId,
        phoneE164: identity.phoneE164,
        email: identity.emailNormalized ?? null,
        fullName: identity.fullName ?? null,
        photoUrl:
          passengerPhotoPath(identity.photoUpdatedAt) ??
          identity.photoUrl ??
          null,
      });
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/passenger/me/account'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const body = await readJson(request);
      const fullName =
        body != null && typeof body === 'object' && 'fullName' in body
          ? String((body as { fullName?: unknown }).fullName ?? '')
          : undefined;
      const email =
        body != null && typeof body === 'object' && 'email' in body
          ? String((body as { email?: unknown }).email ?? '')
          : undefined;
      const password =
        body != null && typeof body === 'object' && 'password' in body
          ? String((body as { password?: unknown }).password ?? '')
          : undefined;

      const account = await updatePassengerAccount({
        identities: authOtpRepository,
        subjectId: session.subjectId,
        ...(fullName == null ? {} : { fullName }),
        ...(email == null ? {} : { email }),
        ...(password == null ? {} : { password }),
      });
      const updatedIdentity =
        await authOtpRepository.findIdentityBySubject(
          'passenger',
          session.subjectId,
        );

      json(response, 200, {
        ...account,
        photoUrl:
          passengerPhotoPath(updatedIdentity?.photoUpdatedAt) ??
          account.photoUrl ??
          null,
      });
      return;
    }


    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/passenger/me/saved-places'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      json(
        response,
        200,
        await listPassengerSavedPlaces({
          repository: passengerSavedPlaceRepository,
          passengerId: session.subjectId,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/passenger/me/saved-places'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};

      json(
        response,
        200,
        await savePassengerSavedPlace({
          repository: passengerSavedPlaceRepository,
          passengerId: session.subjectId,
          kind: value.kind,
          label: value.label,
          name: value.name,
          address: value.address,
          latitude: value.latitude,
          longitude: value.longitude,
          providerPlaceId: value.providerPlaceId,
          approvedPricingZoneId: value.approvedPricingZoneId,
          approvedPricingLocalityId: value.approvedPricingLocalityId,
        }),
      );
      return;
    }

    const passengerSavedPlaceMatch = requestUrl.pathname.match(
      /^\/v1\/passenger\/me\/saved-places\/([0-9a-fA-F-]+)$/,
    );
    if (
      request.method === 'DELETE' &&
      passengerSavedPlaceMatch != null
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
        requiredType: 'passenger',
      });
      await deletePassengerSavedPlace({
        repository: passengerSavedPlaceRepository,
        passengerId: session.subjectId,
        id: passengerSavedPlaceMatch[1]!,
      });
      response.writeHead(204);
      response.end();
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/notifications/device'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      const registration = parsePushDeviceRegistration(
        await readJson(request),
      );
      const device = await registerPushDevice({
        repository: pushDeviceRepository,
        session,
        registration,
      });
      const release = await notifyRegisteredDeviceIfOutdated({
        communications: adminCommunicationsRepository,
        devices: pushDeviceRepository,
        push: pushNotificationService,
        device,
      });
      json(response, 200, {
        device: pushDevicePublicView(device),
        deliveryProvider: pushNotificationService.providerKind,
        releasePolicy: release.policy,
        updateNotificationDelivered:
          release.notificationDelivered,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/auth/session'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      json(response, 200, {
        id: session.id,
        subjectType: session.subjectType,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/auth/session/revoke-others'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      const now = new Date().toISOString();
      const revokedSessions =
        await authSessionRepository.revokeOthersForSubject(
          session.subjectType,
          session.subjectId,
          session.id,
          now,
        );

      const devices =
        await pushDeviceRepository.listEnabledForSubject(
          session.subjectType,
          session.subjectId,
        );
      let disabledDevices = 0;
      for (const device of devices) {
        if (device.sessionId === session.id) continue;
        await pushDeviceRepository.disableDevice(device.id, now);
        disabledDevices += 1;
      }

      json(response, 200, {
        revokedSessions,
        disabledDevices,
      });
      return;
    }

    if (
      request.method === 'DELETE' &&
      requestUrl.pathname === '/v1/auth/session'
    ) {
      const revoked = await revokeBearerSession({
        repository: authSessionRepository,
        headers: request.headers,
      });
      await pushDeviceRepository.disableForSession(
        revoked.id,
        new Date().toISOString(),
      );
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
        registry: driverRegistryRepository,
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
      requestUrl.pathname === '/v1/admin/communications'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:read',
      });
      json(
        response,
        200,
        await adminCommunicationsView({
          communications: adminCommunicationsRepository,
          push: pushNotificationService,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/admin/notifications'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const body = parseAdminNotificationBroadcast(
        await readJson(request),
      );
      const campaign = await sendAdminNotification({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        push: pushNotificationService,
        ...body,
      });
      json(response, 201, { campaign });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/app-auth-branding/hero'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:read',
      });
      const hero = await adminCommunicationsRepository.readAppAuthHero();
      if (hero == null) {
        json(response, 404, { error: 'APP_AUTH_HERO_NOT_FOUND', message: 'Imagem de login não configurada.' });
        return;
      }
      response.writeHead(200, {
        'content-type': hero.mimeType,
        'content-length': String(hero.bytes.byteLength),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(Buffer.from(hero.bytes));
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/admin/app-auth-branding/hero'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const rawMimeType = headerValue(request, 'content-type')?.split(';')[0]?.trim().toLowerCase();
      if (rawMimeType !== 'image/jpeg' && rawMimeType !== 'image/png' && rawMimeType !== 'image/webp') {
        json(response, 415, { error: 'UNSUPPORTED_APP_AUTH_HERO_TYPE', message: 'Envie uma imagem JPEG, PNG ou WebP.' });
        return;
      }
      const bytes = await readBinaryBody(request, MAX_APP_AUTH_HERO_BYTES);
      if (bytes.byteLength < 128 || !hasValidImageMagic(bytes, rawMimeType)) {
        json(response, 422, { error: 'INVALID_APP_AUTH_HERO', message: 'O conteúdo não corresponde a uma imagem válida.' });
        return;
      }
      const appAuthBranding = await updateAppAuthHero({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        mimeType: rawMimeType,
        bytes,
      });
      json(response, 200, { appAuthBranding });
      return;
    }

    const adminReleasePolicyMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/release-policy\/(passenger|driver)\/(android|ios)$/,
    );
    if (
      request.method === 'PATCH' &&
      adminReleasePolicyMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const appKind = parseAppKind(adminReleasePolicyMatch[1]!);
      const platform = parsePushPlatform(adminReleasePolicyMatch[2]!);
      const body = parseAdminReleasePolicyUpdate(
        await readJson(request),
      );
      const result = await updateAppReleasePolicy({
        communications: adminCommunicationsRepository,
        devices: pushDeviceRepository,
        admin: adminRepository,
        actor,
        push: pushNotificationService,
        appKind,
        platform,
        ...body,
      });
      json(response, 200, result);
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/admin/agency-promotion'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const body = parseAdminAgencyPromotionUpdate(
        await readJson(request),
      );
      const promotion = await updateAgencyPromotion({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        ...body,
      });
      json(response, 200, { promotion });
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/admin/social-links'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const body = parseAdminSocialLinksUpdate(
        await readJson(request),
      );
      const socialLinks = await updateSocialLinks({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        ...body,
      });
      json(response, 200, { socialLinks });
      return;
    }

    const adminTourCoverMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/tours\/([^/]+)\/cover$/,
    );
    if (
      request.method === 'GET' &&
      adminTourCoverMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:read',
      });
      const slug = parseAgencyTourSlug(
        decodeURIComponent(adminTourCoverMatch[1] ?? ''),
      );
      const cover = await adminCommunicationsRepository.readTourCover(slug);
      if (cover == null) {
        json(response, 404, {
          error: 'TOUR_COVER_NOT_FOUND',
          message: 'Foto do passeio não encontrada.',
        });
        return;
      }
      response.writeHead(200, {
        'content-type': cover.mimeType,
        'content-length': String(cover.bytes.byteLength),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(Buffer.from(cover.bytes));
      return;
    }

    if (
      request.method === 'PUT' &&
      adminTourCoverMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const slug = parseAgencyTourSlug(
        decodeURIComponent(adminTourCoverMatch[1] ?? ''),
      );
      const mimeType = headerValue(request, 'content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      if (
        mimeType !== 'image/jpeg' &&
        mimeType !== 'image/png' &&
        mimeType !== 'image/webp'
      ) {
        json(response, 415, {
          error: 'UNSUPPORTED_TOUR_COVER_TYPE',
          message: 'Envie uma imagem JPEG, PNG ou WebP.',
        });
        return;
      }
      const bytes = await readBinaryBody(
        request,
        MAX_AGENCY_TOUR_COVER_BYTES,
      );
      if (bytes.byteLength === 0) {
        json(response, 422, {
          error: 'EMPTY_TOUR_COVER',
          message: 'A foto do passeio está vazia.',
        });
        return;
      }
      const tour = await updateAgencyTourCover({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        slug,
        mimeType,
        bytes,
      });
      if (tour == null) {
        json(response, 404, {
          error: 'TOUR_NOT_FOUND',
          message: 'Salve o passeio antes de enviar a foto.',
        });
        return;
      }
      json(response, 200, { tour });
      return;
    }

    const adminTourMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/tours\/([^/]+)$/,
    );
    if (
      request.method === 'PUT' &&
      adminTourMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const slug = parseAgencyTourSlug(
        decodeURIComponent(adminTourMatch[1] ?? ''),
      );
      const body = parseAdminAgencyTourUpdate(
        await readJson(request),
      );
      const tour = await updateAgencyTour({
        communications: adminCommunicationsRepository,
        admin: adminRepository,
        actor,
        slug,
        ...body,
      });
      json(response, 200, { tour });
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
      requestUrl.pathname === '/v1/admin/fleet'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'fleet:read',
      });
      const operationalSettings =
        await operationalSettingsRepository.get();
      const fleet = await adminFleetSnapshot({
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rides: rideRepository,
        staleAfterSeconds:
          operationalSettings.driverLocationMaxAgeSeconds,
      });
      json(response, 200, fleet);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/finance'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:read',
      });
      const rawLimit = Number(requestUrl.searchParams.get('limit') ?? '25');
      const finance = await adminFinanceView({
        finance: financeRepository,
        limit: Number.isFinite(rawLimit) ? rawLimit : 25,
      });
      json(response, 200, finance);
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/admin/finance/payouts/reconcile'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      if (driverPayoutProvider == null) {
        json(response, 503, {
          error: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
          message: 'Provedor automático de repasse Pix não configurado.',
        });
        return;
      }

      const reconciliation = await reconcileDriverPayouts({
        finance: financeRepository,
        provider: driverPayoutProvider,
        limit: 100,
      });
      await adminRepository.appendAudit({
        id: randomUUID(),
        actor,
        action: 'finance.payout.reconciled',
        targetType: 'driver_payout_batch',
        targetId: 'automatic-provider',
        metadata: reconciliation,
        createdAt: new Date().toISOString(),
      });
      json(response, 200, reconciliation);
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/admin/finance/payout-policy'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      assertAdminPayoutOwner(actor);
      const body = await readJson(request);
      const automaticEnabled =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body)
          ? (body as { automaticEnabled?: unknown }).automaticEnabled
          : undefined;
      if (typeof automaticEnabled !== 'boolean') {
        throw new InvalidAdminRequestError(
          'automaticEnabled deve ser booleano.',
        );
      }
      json(
        response,
        200,
        await updateAdminPayoutAutomaticMode({
          finance: financeRepository,
          admin: adminRepository,
          actor,
          automaticEnabled,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/admin/finance/payouts/manual'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      assertAdminPayoutOwner(actor);
      if (driverPayoutProvider == null) {
        json(response, 503, {
          error: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
          message: 'Provedor automático de repasse Pix não configurado.',
        });
        return;
      }

      const body = await readJson(request);
      const payload =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body)
          ? body as { driverIds?: unknown; batchId?: unknown }
          : {};
      if (
        !Array.isArray(payload.driverIds) ||
        !payload.driverIds.every(
          (value) => typeof value === 'string',
        ) ||
        typeof payload.batchId !== 'string' ||
        !/^[0-9a-fA-F-]{36}$/.test(payload.batchId)
      ) {
        throw new InvalidAdminRequestError(
          'Lote manual de repasses inválido.',
        );
      }

      const batch = await createAdminManualPayoutBatch({
        finance: financeRepository,
        admin: adminRepository,
        actor,
        driverIds: payload.driverIds as string[],
        batchId: payload.batchId,
      });
      const created = [];
      for (const payout of batch.created) {
        try {
          const processed = await processDriverPayout({
            finance: financeRepository,
            provider: driverPayoutProvider,
            payoutId: payout.id,
          });
          created.push({
            payoutId: payout.id,
            driverId: payout.driverId,
            status: processed.payout.status,
          });
        } catch (error) {
          logWarn('driver.payout.manual_provider_retry_pending', {
            payoutId: payout.id,
            driverId: payout.driverId,
            ...errorFields(error),
          });
          created.push({
            payoutId: payout.id,
            driverId: payout.driverId,
            status: 'requested',
            providerRetryPending: true,
          });
        }
      }

      json(response, 200, {
        batchId: payload.batchId,
        created,
        skipped: batch.skipped,
      });
      return;
    }

    const adminPayoutMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/finance\/payouts\/([0-9a-fA-F-]{36})$/,
    );
    if (
      request.method === 'GET' &&
      adminPayoutMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      json(
        response,
        200,
        await getAdminPayoutDetail({
          finance: financeRepository,
          payoutId: adminPayoutMatch[1]!,
        }),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      adminPayoutMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      assertAdminPayoutOwner(actor);
      const body = await readJson(request);
      if (
        body == null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        throw new InvalidAdminRequestError(
          'Atualização do saque inválida.',
        );
      }
      const payload = body as {
        action?: unknown;
        processor?: unknown;
        processorPayoutId?: unknown;
      };
      const action =
        typeof payload.action === 'string'
          ? payload.action.trim()
          : '';

      if (action === 'approved') {
        if (driverPayoutProvider == null) {
          json(response, 503, {
            error: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
            message: 'Provedor automático de repasse Pix não configurado.',
          });
          return;
        }

        const approved = await approveAdminPayout({
          finance: financeRepository,
          admin: adminRepository,
          actor,
          payoutId: adminPayoutMatch[1]!,
        });
        let payout = approved.payout;
        let providerRetryPending = false;
        try {
          const processed = await processDriverPayout({
            finance: financeRepository,
            provider: driverPayoutProvider,
            payoutId: adminPayoutMatch[1]!,
          });
          payout = adminPayoutDetailView(processed.payout);
        } catch (error) {
          providerRetryPending = true;
          logWarn('driver.payout.approved_provider_retry_pending', {
            payoutId: adminPayoutMatch[1]!,
            ...errorFields(error),
          });
        }

        json(response, 200, {
          payout,
          duplicate: approved.duplicate,
          providerRetryPending,
        });
        return;
      }

      if (action === 'paid') {
        if (typeof payload.processor !== 'string') {
          throw new InvalidAdminRequestError(
            'processor é obrigatório para concluir o repasse.',
          );
        }
        if (
          payload.processorPayoutId != null &&
          typeof payload.processorPayoutId !== 'string'
        ) {
          throw new InvalidAdminRequestError(
            'processorPayoutId deve ser texto.',
          );
        }
        json(
          response,
          200,
          await completeAdminPayout({
            finance: financeRepository,
            admin: adminRepository,
            actor,
            payoutId: adminPayoutMatch[1]!,
            processor: payload.processor,
            ...(payload.processorPayoutId == null
              ? {}
              : { processorPayoutId: payload.processorPayoutId }),
          }),
        );
        return;
      }

      if (action === 'cancelled') {
        json(
          response,
          200,
          await cancelAdminPayout({
            finance: financeRepository,
            admin: adminRepository,
            actor,
            payoutId: adminPayoutMatch[1]!,
          }),
        );
        return;
      }

      throw new InvalidAdminRequestError(
        'action deve ser approved, paid ou cancelled.',
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/integrations'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });
      json(response, 200, adminIntegrationSetupView());
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/operational-settings'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });
      json(
        response,
        200,
        await adminOperationalSettingsView(
          operationalSettingsRepository,
        ),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/admin/operational-settings'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:write',
      });
      const body = await readJson(request);
      if (
        body == null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        throw new InvalidAdminRequestError(
          'Configurações operacionais inválidas.',
        );
      }

      const payload = body as {
        driverOfferTtlSeconds?: unknown;
        driverPaymentHoldSeconds?: unknown;
        noDriverDecisionTimeoutSeconds?: unknown;
        driverLocationMaxAgeSeconds?: unknown;
        nearbyDriverMaxDistanceKm?: unknown;
        showNearbyDrivers?: unknown;
        driverDocumentAutoEnforcement?: unknown;
        mercadoPagoPublicKey?: unknown;
      };
      const driverOfferTtlSeconds =
        payload.driverOfferTtlSeconds == null
          ? undefined
          : Number(payload.driverOfferTtlSeconds);
      const driverPaymentHoldSeconds =
        payload.driverPaymentHoldSeconds == null
          ? undefined
          : Number(payload.driverPaymentHoldSeconds);
      const noDriverDecisionTimeoutSeconds =
        payload.noDriverDecisionTimeoutSeconds == null
          ? undefined
          : Number(payload.noDriverDecisionTimeoutSeconds);
      const driverLocationMaxAgeSeconds =
        payload.driverLocationMaxAgeSeconds == null
          ? undefined
          : Number(payload.driverLocationMaxAgeSeconds);
      const nearbyDriverMaxDistanceKm =
        payload.nearbyDriverMaxDistanceKm == null
          ? undefined
          : Number(payload.nearbyDriverMaxDistanceKm);
      const showNearbyDrivers =
        payload.showNearbyDrivers == null
          ? undefined
          : payload.showNearbyDrivers;
      const driverDocumentAutoEnforcement =
        payload.driverDocumentAutoEnforcement == null
          ? undefined
          : payload.driverDocumentAutoEnforcement;
      const mercadoPagoPublicKey = Object.prototype.hasOwnProperty.call(
        payload,
        'mercadoPagoPublicKey',
      )
        ? payload.mercadoPagoPublicKey
        : undefined;

      if (
        driverOfferTtlSeconds != null &&
        !Number.isInteger(driverOfferTtlSeconds)
      ) {
        throw new InvalidAdminRequestError(
          'driverOfferTtlSeconds deve ser inteiro.',
        );
      }
      if (
        driverPaymentHoldSeconds != null &&
        !Number.isInteger(driverPaymentHoldSeconds)
      ) {
        throw new InvalidAdminRequestError(
          'driverPaymentHoldSeconds deve ser inteiro.',
        );
      }
      if (
        noDriverDecisionTimeoutSeconds != null &&
        !Number.isInteger(noDriverDecisionTimeoutSeconds)
      ) {
        throw new InvalidAdminRequestError(
          'noDriverDecisionTimeoutSeconds deve ser inteiro.',
        );
      }
      if (
        driverLocationMaxAgeSeconds != null &&
        !Number.isInteger(driverLocationMaxAgeSeconds)
      ) {
        throw new InvalidAdminRequestError(
          'driverLocationMaxAgeSeconds deve ser inteiro.',
        );
      }
      if (
        nearbyDriverMaxDistanceKm != null &&
        !Number.isFinite(nearbyDriverMaxDistanceKm)
      ) {
        throw new InvalidAdminRequestError(
          'nearbyDriverMaxDistanceKm deve ser numérico.',
        );
      }
      if (
        showNearbyDrivers != null &&
        typeof showNearbyDrivers !== 'boolean'
      ) {
        throw new InvalidAdminRequestError(
          'showNearbyDrivers deve ser booleano.',
        );
      }
      if (
        driverDocumentAutoEnforcement != null &&
        typeof driverDocumentAutoEnforcement !== 'boolean'
      ) {
        throw new InvalidAdminRequestError(
          'driverDocumentAutoEnforcement deve ser booleano.',
        );
      }
      if (
        mercadoPagoPublicKey !== undefined &&
        mercadoPagoPublicKey !== null &&
        typeof mercadoPagoPublicKey !== 'string'
      ) {
        throw new InvalidAdminRequestError(
          'mercadoPagoPublicKey deve ser texto ou null.',
        );
      }
      if (driverDocumentAutoEnforcement != null) {
        await authenticateAdminPrincipal({
          apiKeys: adminRepository,
          humanAuth: adminHumanAuthRepository,
          headers: request.headers,
          requiredScope: 'drivers:documents:write',
        });
      }
      if (mercadoPagoPublicKey !== undefined) {
        await authenticateAdminPrincipal({
          apiKeys: adminRepository,
          humanAuth: adminHumanAuthRepository,
          headers: request.headers,
          requiredScope: 'finance:write',
        });
      }
      if (
        driverOfferTtlSeconds == null &&
        driverPaymentHoldSeconds == null &&
        noDriverDecisionTimeoutSeconds == null &&
        driverLocationMaxAgeSeconds == null &&
        nearbyDriverMaxDistanceKm == null &&
        showNearbyDrivers == null &&
        driverDocumentAutoEnforcement == null &&
        mercadoPagoPublicKey === undefined
      ) {
        throw new InvalidAdminRequestError(
          'Informe ao menos uma configuração operacional.',
        );
      }

      const settings = await updateAdminOperationalSettings({
        repository: operationalSettingsRepository,
        admin: adminRepository,
        actor,
        ...(driverOfferTtlSeconds == null
          ? {}
          : { driverOfferTtlSeconds }),
        ...(driverPaymentHoldSeconds == null
          ? {}
          : { driverPaymentHoldSeconds }),
        ...(noDriverDecisionTimeoutSeconds == null
          ? {}
          : { noDriverDecisionTimeoutSeconds }),
        ...(driverLocationMaxAgeSeconds == null
          ? {}
          : { driverLocationMaxAgeSeconds }),
        ...(nearbyDriverMaxDistanceKm == null
          ? {}
          : { nearbyDriverMaxDistanceKm }),
        ...(showNearbyDrivers == null
          ? {}
          : { showNearbyDrivers }),
        ...(driverDocumentAutoEnforcement == null
          ? {}
          : { driverDocumentAutoEnforcement }),
        ...(mercadoPagoPublicKey === undefined
          ? {}
          : {
              mercadoPagoPublicKey:
                mercadoPagoPublicKey as string | null,
            }),
      });
      json(response, 200, settings);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/payment-policy'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:read',
      });
      json(
        response,
        200,
        await adminPaymentPolicyView(paymentPolicySettingsRepository),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/admin/payment-policy'
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      const body = await readJson(request);
      if (
        body == null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        throw new InvalidAdminRequestError(
          'Política de pagamento inválida.',
        );
      }
      const payload = body as {
        cashEnabled?: unknown;
        pixEnabled?: unknown;
        cardEnabled?: unknown;
        walletEnabled?: unknown;
        defaultCashDebtLimitCents?: unknown;
        pixPriceAdjustmentBps?: unknown;
        cardPriceAdjustmentBps?: unknown;
      };
      for (const [field, value] of [
        ['cashEnabled', payload.cashEnabled],
        ['pixEnabled', payload.pixEnabled],
        ['cardEnabled', payload.cardEnabled],
        ['walletEnabled', payload.walletEnabled],
      ] as const) {
        if (value != null && typeof value !== 'boolean') {
          throw new InvalidAdminRequestError(
            `${field} deve ser booleano.`,
          );
        }
      }
      const cashEnabled =
        typeof payload.cashEnabled === 'boolean'
          ? payload.cashEnabled
          : undefined;
      const pixEnabled =
        typeof payload.pixEnabled === 'boolean'
          ? payload.pixEnabled
          : undefined;
      const cardEnabled =
        typeof payload.cardEnabled === 'boolean'
          ? payload.cardEnabled
          : undefined;
      const walletEnabled =
        typeof payload.walletEnabled === 'boolean'
          ? payload.walletEnabled
          : undefined;
      const defaultCashDebtLimitCents =
        payload.defaultCashDebtLimitCents == null
          ? undefined
          : Number(payload.defaultCashDebtLimitCents);
      const pixPriceAdjustmentBps =
        payload.pixPriceAdjustmentBps == null
          ? undefined
          : Number(payload.pixPriceAdjustmentBps);
      const cardPriceAdjustmentBps =
        payload.cardPriceAdjustmentBps == null
          ? undefined
          : Number(payload.cardPriceAdjustmentBps);
      for (const [field, value] of [
        ['defaultCashDebtLimitCents', defaultCashDebtLimitCents],
        ['pixPriceAdjustmentBps', pixPriceAdjustmentBps],
        ['cardPriceAdjustmentBps', cardPriceAdjustmentBps],
      ] as const) {
        if (value != null && !Number.isInteger(value)) {
          throw new InvalidAdminRequestError(
            `${field} deve ser inteiro.`,
          );
        }
      }
      if (
        cashEnabled == null &&
        pixEnabled == null &&
        cardEnabled == null &&
        walletEnabled == null &&
        defaultCashDebtLimitCents == null &&
        pixPriceAdjustmentBps == null &&
        cardPriceAdjustmentBps == null
      ) {
        throw new InvalidAdminRequestError(
          'Informe ao menos uma configuração de pagamento.',
        );
      }
      const policy = await updateAdminPaymentPolicy({
        repository: paymentPolicySettingsRepository,
        admin: adminRepository,
        actor,
        ...(cashEnabled == null ? {} : { cashEnabled }),
        ...(pixEnabled == null ? {} : { pixEnabled }),
        ...(cardEnabled == null ? {} : { cardEnabled }),
        ...(walletEnabled == null ? {} : { walletEnabled }),
        ...(defaultCashDebtLimitCents == null
          ? {}
          : { defaultCashDebtLimitCents }),
        ...(pixPriceAdjustmentBps == null
          ? {}
          : { pixPriceAdjustmentBps }),
        ...(cardPriceAdjustmentBps == null
          ? {}
          : { cardPriceAdjustmentBps }),
      });
      json(response, 200, policy);
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
      const body = await readJson(request);
      const expectedUpdatedAt =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        'expectedUpdatedAt' in body
          ? String(
              (body as { expectedUpdatedAt?: unknown })
                .expectedUpdatedAt ?? '',
            ).trim()
          : '';
      if (
        expectedUpdatedAt &&
        !Number.isFinite(Date.parse(expectedUpdatedAt))
      ) {
        throw new InvalidAdminRequestError(
          'expectedUpdatedAt deve ser uma data ISO válida.',
        );
      }
      const patch = parsePricingCatalogDraftPatch(body);
      const updated = await updatePricingCatalogDraft({
        versions: pricingCatalogVersionRepository,
        admin: adminRepository,
        actor,
        versionId: pricingVersionMatch[1]!,
        patch,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
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
      const rawExpectedUpdatedAt =
        body != null &&
        typeof body === 'object' &&
        'expectedUpdatedAt' in body
          ? (body as { expectedUpdatedAt?: unknown }).expectedUpdatedAt
          : undefined;
      if (
        rawEffectiveFrom != null &&
        typeof rawEffectiveFrom !== 'string'
      ) {
        throw new InvalidAdminRequestError(
          'effectiveFrom deve ser uma data ISO em texto.',
        );
      }
      if (
        rawExpectedUpdatedAt != null &&
        (typeof rawExpectedUpdatedAt !== 'string' ||
          !Number.isFinite(Date.parse(rawExpectedUpdatedAt)))
      ) {
        throw new InvalidAdminRequestError(
          'expectedUpdatedAt deve ser uma data ISO válida.',
        );
      }

      const published = await publishPricingCatalogVersion({
        versions: pricingCatalogVersionRepository,
        admin: adminRepository,
        actor,
        versionId: pricingPublishMatch[1]!,
        ...(rawExpectedUpdatedAt == null
          ? {}
          : { expectedUpdatedAt: rawExpectedUpdatedAt }),
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

    const adminRideCancelMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/rides\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\/cancel$/,
    );
    if (
      request.method === 'POST' &&
      adminRideCancelMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:write',
      });
      const body = await readJson(request);
      const reason =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        'reason' in body
          ? String((body as { reason?: unknown }).reason ?? '')
          : '';

      const result = await cancelRideFromAdmin({
        rides: rideRepository,
        matching: rideMatchingRepository,
        finance: financeRepository,
        admin: adminRepository,
        actor,
        rideId: adminRideCancelMatch[1]!,
        reason,
      });

      let ride = result.ride;
      let paymentView = result.payment;
      let refundStatus = result.refundStatus;

      if (refundStatus === 'pending_external_gateway') {
        const fullPayment =
          await financeRepository.findPaymentById(result.payment.id);

        if (
          fullPayment?.processor === 'mercado-pago-orders' &&
          mercadoPagoOrdersClient != null
        ) {
          const orderId = fullPayment.processorPaymentId?.trim();
          if (!orderId) {
            throw new ExternalRideRefundError(
              'PAYMENT_GATEWAY_REFERENCE_MISSING',
              'Pagamento não possui referência da Order do Mercado Pago.',
            );
          }

          const gatewayOrder =
            await mercadoPagoOrdersClient.refundOrder(
              orderId,
              `admin-refund-${fullPayment.id}`,
            );

          if (mercadoPagoOrderRefundState(gatewayOrder) === 'full') {
            const refunded =
              await financeRepository.refundExternalPayment({
                paymentId: fullPayment.id,
              });
            await finalizeMercadoPagoRefundedRide(refunded.payment);

            ride = (await rideRepository.findById(ride.id)) ?? ride;
            paymentView = {
              id: refunded.payment.id,
              method: refunded.payment.method,
              status: refunded.payment.status,
              amountCents: refunded.payment.amountCents,
            };
            refundStatus = 'refunded';
          }
        }
      }

      json(response, 200, {
        ride: {
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
          updatedAt: ride.updatedAt,
        },
        payment: paymentView,
        duplicateCancellation: result.duplicateCancellation,
        refundStatus,
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

    const adminPassengerProfileUpdateMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)\/profile$/,
      );
    if (
      request.method === 'PATCH' &&
      adminPassengerProfileUpdateMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'passengers:auth:write',
      });
      const body = await readJson(request);
      if (
        body == null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        throw new InvalidAdminRequestError(
          'Atualização do passageiro inválida.',
        );
      }
      const payload = body as {
        fullName?: unknown;
        email?: unknown;
      };
      const hasFullName = Object.prototype.hasOwnProperty.call(
        payload,
        'fullName',
      );
      const hasEmail = Object.prototype.hasOwnProperty.call(
        payload,
        'email',
      );
      if (
        hasFullName &&
        payload.fullName !== null &&
        typeof payload.fullName !== 'string'
      ) {
        throw new InvalidAdminRequestError(
          'fullName deve ser texto ou null.',
        );
      }
      if (
        hasEmail &&
        payload.email !== null &&
        typeof payload.email !== 'string'
      ) {
        throw new InvalidAdminRequestError(
          'email deve ser texto ou null.',
        );
      }
      if (!hasFullName && !hasEmail) {
        throw new InvalidAdminRequestError(
          'Informe ao menos nome ou e-mail.',
        );
      }

      const passenger = await updatePassengerProfileFromAdmin({
        identities: authOtpRepository,
        admin: adminRepository,
        actor,
        passengerId: adminPassengerProfileUpdateMatch[1]!,
        ...(hasFullName
          ? { fullName: payload.fullName as string | null }
          : {}),
        ...(hasEmail
          ? { email: payload.email as string | null }
          : {}),
      });
      json(response, 200, { passenger });
      return;
    }

    const adminPassengerStatusMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)\/auth\/status$/,
    );
    if (
      request.method === 'PATCH' &&
      adminPassengerStatusMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'passengers:auth:write',
      });
      const body = await readJson(request);
      const status =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        'status' in body
          ? String((body as { status?: unknown }).status ?? '')
          : '';
      const result = await setPassengerAuthStatusFromAdmin({
        identities: authOtpRepository,
        sessions: authSessionRepository,
        admin: adminRepository,
        actor,
        passengerId: adminPassengerStatusMatch[1]!,
        status: status as 'active' | 'suspended',
      });
      json(response, 200, {
        passenger: {
          passengerId: result.identity.subjectId,
          phoneE164: result.identity.phoneE164,
          status: result.identity.status,
          createdAt: result.identity.createdAt,
          updatedAt: result.identity.updatedAt,
        },
        revokedSessions: result.revokedSessions,
      });
      return;
    }

    const adminPassengerMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)$/,
    );
    const adminPassengerWalletMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)\/wallet$/,
    );
    if (
      request.method === 'GET' &&
      adminPassengerWalletMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:read',
      });
      const wallet = await adminPassengerWalletView({
        identities: authOtpRepository,
        finance: financeRepository,
        passengerId: adminPassengerWalletMatch[1]!,
      });
      json(response, 200, wallet);
      return;
    }

    const adminPassengerNotificationsMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)\/notifications$/,
      );
    if (
      request.method === 'GET' &&
      adminPassengerNotificationsMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:read',
      });
      const notifications = await adminPassengerNotificationsView({
        identities: authOtpRepository,
        devices: pushDeviceRepository,
        passengerId: adminPassengerNotificationsMatch[1]!,
      });
      json(response, 200, notifications);
      return;
    }

    const adminPassengerPhotoMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/passengers\/([A-Za-z0-9._:-]+)\/photo$/,
    );
    if (
      request.method === 'GET' &&
      adminPassengerPhotoMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'passengers:auth:read',
      });
      const passengerId = adminPassengerPhotoMatch[1]!;
      const identity = await authOtpRepository.findIdentityBySubject(
        'passenger',
        passengerId,
      );
      if (identity == null) {
        throw new AdminPassengerError(
          'PASSENGER_NOT_FOUND',
          'Passageiro não encontrado.',
        );
      }
      const photo = await authOtpRepository.findPassengerProfilePhoto(
        passengerId,
      );
      if (photo == null) {
        json(response, 404, {
          error: 'PASSENGER_PHOTO_NOT_FOUND',
          message: 'Foto do passageiro não encontrada.',
        });
        return;
      }
      response.writeHead(200, {
        'content-type': photo.mimeType,
        'content-length': String(photo.bytes.length),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(photo.bytes);
      return;
    }

    if (
      request.method === 'GET' &&
      adminPassengerMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'passengers:auth:read',
      });
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'rides:read',
      });
      const profile = await adminPassengerProfile({
        identities: authOtpRepository,
        rides: rideRepository,
        savedPlaces: passengerSavedPlaceRepository,
        passengerId: adminPassengerMatch[1]!,
      });
      json(response, 200, profile);
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

    const adminDriverDocumentInspectionIssueMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/documents\/(driver_license|vehicle_registration)\/inspection$/,
      );
    if (
      request.method === 'POST' &&
      adminDriverDocumentInspectionIssueMatch != null
    ) {
      if (
        privateDocumentStorage == null ||
        documentInspectionEncryptionKey == null
      ) {
        json(response, 503, {
          error: 'DOCUMENT_STORAGE_NOT_CONFIGURED',
          message:
            'Storage privado de documentos ainda não está configurado.',
        });
        return;
      }
      const authenticated = await authenticateAdminHumanSession({
        repository: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:read',
      });
      const result = await issueDriverDocumentInspection({
        documents: driverDocumentRepository,
        admin: adminRepository,
        actor: {
          kind: 'user',
          id: authenticated.user.id,
          name: authenticated.user.name,
        },
        driverId: adminDriverDocumentInspectionIssueMatch[1]!,
        documentType:
          adminDriverDocumentInspectionIssueMatch[2]! as DriverDocumentType,
        encryptionKey: documentInspectionEncryptionKey,
        ttlSeconds: documentInspectionTtlSeconds,
      });
      json(response, 201, result);
      return;
    }

    const adminDriverDocumentInspectionReadMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/document-inspection\/(rn_doc_inspect_v1\.[A-Za-z0-9_.-]+)$/,
      );
    if (
      request.method === 'GET' &&
      adminDriverDocumentInspectionReadMatch != null
    ) {
      if (
        privateDocumentStorage == null ||
        documentInspectionEncryptionKey == null
      ) {
        json(response, 503, {
          error: 'DOCUMENT_STORAGE_NOT_CONFIGURED',
          message:
            'Storage privado de documentos ainda não está configurado.',
        });
        return;
      }
      await authenticateAdminHumanSession({
        repository: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:read',
      });
      const inspected = await readDriverDocumentInspection({
        token: adminDriverDocumentInspectionReadMatch[1]!,
        encryptionKey: documentInspectionEncryptionKey,
        storage: privateDocumentStorage,
      });
      const extension =
        inspected.mimeType === 'application/pdf'
          ? 'pdf'
          : inspected.mimeType === 'image/png'
            ? 'png'
            : 'jpg';
      response.writeHead(200, {
        'content-type': inspected.mimeType,
        'content-length': String(inspected.bytes.length),
        'content-disposition':
          `inline; filename="driver-document.${extension}"`,
        'cache-control': 'private, no-store, max-age=0',
        pragma: 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "default-src 'none'; sandbox; frame-ancestors 'none'",
      });
      response.end(inspected.bytes);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/driver-document-compliance-alerts'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:read',
      });
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:auth:read',
      });
      json(
        response,
        200,
        await listAdminDriverDocumentComplianceAlerts({
          identities: authOtpRepository,
          documents: driverDocumentRepository,
          controls: driverDocumentComplianceRepository,
          settings: operationalSettingsRepository,
        }),
      );
      return;
    }

    const adminDriverDocumentComplianceNotifyMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/document-compliance\/notify$/,
      );
    if (
      request.method === 'POST' &&
      adminDriverDocumentComplianceNotifyMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:write',
      });
      const result = await notifyDriverDocumentCompliance({
        documents: driverDocumentRepository,
        controls: driverDocumentComplianceRepository,
        settings: operationalSettingsRepository,
        admin: adminRepository,
        actor,
        push: pushNotificationService,
        driverId: adminDriverDocumentComplianceNotifyMatch[1]!,
      });
      json(response, 200, result);
      return;
    }

    const adminDriverDocumentComplianceMatch =
      requestUrl.pathname.match(
        /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/document-compliance$/,
      );
    if (
      request.method === 'GET' &&
      adminDriverDocumentComplianceMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:read',
      });
      json(
        response,
        200,
        await adminDriverDocumentComplianceView({
          documents: driverDocumentRepository,
          controls: driverDocumentComplianceRepository,
          settings: operationalSettingsRepository,
          driverId: adminDriverDocumentComplianceMatch[1]!,
        }),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      adminDriverDocumentComplianceMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'drivers:documents:write',
      });
      const body = await readJson(request);
      const action =
        body != null &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        typeof (body as { action?: unknown }).action === 'string'
          ? (body as { action: string }).action
          : '';
      if (
        action !== 'block' &&
        action !== 'keep_active' &&
        action !== 'unblock'
      ) {
        throw new InvalidAdminRequestError(
          'action deve ser block, keep_active ou unblock.',
        );
      }

      const result = await decideDriverDocumentCompliance({
        documents: driverDocumentRepository,
        controls: driverDocumentComplianceRepository,
        settings: operationalSettingsRepository,
        admin: adminRepository,
        actor,
        driverId: adminDriverDocumentComplianceMatch[1]!,
        action,
      });

      if (result.effectiveBlocked) {
        const supply = await driverSupplyRepository.findByDriverId(
          adminDriverDocumentComplianceMatch[1]!,
        );
        if (supply != null && !supply.busy && supply.online) {
          await driverSupplyRepository.upsert({
            ...supply,
            online: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      json(response, 200, result);
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
      const driverId = adminDriverRegistryStatusMatch[1]!;
      const result = await setDriverRegistryStatusFromAdmin({
        registry: driverRegistryRepository,
        drivers: driverSupplyRepository,
        admin: adminRepository,
        actor,
        driverId,
        ...body,
      });

      let authStatus: 'active' | 'suspended' | null = null;
      let revokedSessions = 0;
      const identity = await authOtpRepository.findIdentityBySubject(
        'driver',
        driverId,
      );
      if (identity != null) {
        authStatus = identity.status;
        if (!result.registryApproved && identity.status === 'active') {
          const suspended = await setDriverAuthStatusFromAdmin({
            identities: authOtpRepository,
            sessions: authSessionRepository,
            registry: driverRegistryRepository,
            admin: adminRepository,
            actor,
            driverId,
            status: 'suspended',
          });
          authStatus = suspended.identity.status;
          revokedSessions = suspended.revokedSessions;
        }
      }

      json(response, 200, {
        ...result,
        authStatus,
        revokedSessions,
      });
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

    const adminDriverFinanceMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/finance$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverFinanceMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:read',
      });
      const driverId = adminDriverFinanceMatch[1]!;
      const identity = await authOtpRepository.findIdentityBySubject(
        'driver',
        driverId,
      );
      if (identity == null) {
        json(response, 404, {
          error: 'DRIVER_NOT_FOUND',
          message: 'Motorista não encontrado.',
        });
        return;
      }
      const [statement, payoutDestination] = await Promise.all([
        driverFinanceStatement({
          repository: financeRepository,
          driverId,
          limit: 50,
        }),
        driverPayoutDestinationForApp(financeRepository, driverId),
      ]);
      json(response, 200, {
        ...statement,
        payoutDestination,
      });
      return;
    }

    const adminDriverCashPolicyMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/drivers\/([A-Za-z0-9._:-]+)\/cash-policy$/,
    );
    if (
      request.method === 'GET' &&
      adminDriverCashPolicyMatch != null
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:read',
      });
      const driverId = adminDriverCashPolicyMatch[1]!;
      await getDriverAuthForAdmin({
        identities: authOtpRepository,
        driverId,
      });
      json(
        response,
        200,
        await adminDriverCashPolicyView({
          settings: paymentPolicySettingsRepository,
          finance: financeRepository,
          driverId,
        }),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      adminDriverCashPolicyMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'finance:write',
      });
      const driverId = adminDriverCashPolicyMatch[1]!;
      await getDriverAuthForAdmin({
        identities: authOtpRepository,
        driverId,
      });
      const body = await readJson(request);
      if (
        body == null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !('debtLimitCents' in body)
      ) {
        throw new InvalidAdminRequestError(
          'debtLimitCents é obrigatório e deve ser inteiro positivo ou null.',
        );
      }
      const debtLimitCents =
        (body as { debtLimitCents?: unknown }).debtLimitCents;
      if (
        debtLimitCents !== null &&
        (!Number.isInteger(debtLimitCents) ||
          Number(debtLimitCents) <= 0)
      ) {
        throw new InvalidAdminRequestError(
          'debtLimitCents deve ser inteiro positivo ou null.',
        );
      }
      json(
        response,
        200,
        await setAdminDriverCashDebtLimit({
          settings: paymentPolicySettingsRepository,
          finance: financeRepository,
          admin: adminRepository,
          actor,
          driverId,
          debtLimitCents:
            debtLimitCents == null ? null : Number(debtLimitCents),
        }),
      );
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
        registry: driverRegistryRepository,
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
      requestUrl.pathname === '/v1/me/privacy'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      json(
        response,
        200,
        await privacyOverview({
          repository: privacyRepository,
          subjectType: session.subjectType,
          subjectId: session.subjectId,
        }),
      );
      return;
    }

    if (
      request.method === 'PATCH' &&
      requestUrl.pathname === '/v1/me/privacy/preferences'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      json(
        response,
        200,
        await updatePrivacyPreferences({
          repository: privacyRepository,
          subjectType: session.subjectType,
          subjectId: session.subjectId,
          marketingNotificationsEnabled:
            value.marketingNotificationsEnabled,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/me/privacy/legal-acceptances'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      json(
        response,
        201,
        await acceptCurrentLegalDocument({
          repository: privacyRepository,
          subjectType: session.subjectType,
          subjectId: session.subjectId,
          documentType: value.documentType,
          version: value.version,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/me/privacy/requests'
    ) {
      const session = await authenticateBearer({
        repository: authSessionRepository,
        identities: authOtpRepository,
        headers: request.headers,
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      json(
        response,
        201,
        await createDataSubjectRequest({
          repository: privacyRepository,
          subjectType: session.subjectType,
          subjectId: session.subjectId,
          requestType: value.requestType,
          note: value.note,
        }),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/privacy'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'privacy:read',
      });

      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,3}$/.test(rawLimit)
          ? 50
          : Math.max(1, Math.min(100, Number(rawLimit)));
      const rawStatus =
        requestUrl.searchParams.get('status')?.trim() ?? '';
      const cursorCreatedAt =
        requestUrl.searchParams.get('cursorCreatedAt')?.trim() ?? '';
      const cursorId =
        requestUrl.searchParams.get('cursorId')?.trim() ?? '';
      if (
        Boolean(cursorCreatedAt) !== Boolean(cursorId) ||
        (
          cursorCreatedAt &&
          (
            !Number.isFinite(Date.parse(cursorCreatedAt)) ||
            !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
              cursorId,
            )
          )
        )
      ) {
        throw new PrivacyError(
          'INVALID_PRIVACY_REQUEST',
          'Cursor de privacidade é inválido.',
        );
      }

      const [legal, requests] = await Promise.all([
        publicLegalDocuments({ repository: privacyRepository }),
        listPrivacyRequestsForAdmin({
          repository: privacyRepository,
          ...(rawStatus ? { status: rawStatus } : {}),
          limit,
          ...(cursorCreatedAt
            ? {
                cursor: {
                  createdAt: new Date(cursorCreatedAt).toISOString(),
                  id: cursorId,
                },
              }
            : {}),
        }),
      ]);
      json(response, 200, {
        legalDocuments: legal.documents,
        ...requests,
      });
      return;
    }

    const adminPrivacyDocumentMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/privacy\/documents\/(privacy_policy|terms_of_use)$/,
    );
    if (
      request.method === 'PUT' &&
      adminPrivacyDocumentMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'privacy:write',
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      json(
        response,
        201,
        await publishLegalDocument({
          repository: privacyRepository,
          admin: adminRepository,
          actor,
          documentType: adminPrivacyDocumentMatch[1],
          title: value.title,
          content: value.content,
          effectiveAt: value.effectiveAt,
        }),
      );
      return;
    }

    const adminPrivacyRequestMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/privacy\/requests\/([0-9a-fA-F-]+)$/,
    );
    if (
      request.method === 'PATCH' &&
      adminPrivacyRequestMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'privacy:write',
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      const updated = await updatePrivacyRequestFromAdmin({
        repository: privacyRepository,
        admin: adminRepository,
        actor,
        id: adminPrivacyRequestMatch[1]!,
        status: value.status,
        response: value.response,
      });
      json(response, 200, updated);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/admin/support'
    ) {
      await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:read',
      });
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,3}$/.test(rawLimit)
          ? 50
          : Math.max(1, Math.min(100, Number(rawLimit)));
      const rawStatus =
        requestUrl.searchParams.get('status')?.trim() ?? '';
      if (
        rawStatus &&
        rawStatus !== 'open' &&
        rawStatus !== 'in_progress' &&
        rawStatus !== 'resolved' &&
        rawStatus !== 'closed'
      ) {
        throw new InvalidAdminRequestError(
          'status de suporte é inválido.',
        );
      }
      const cursorCreatedAt =
        requestUrl.searchParams.get('cursorCreatedAt')?.trim() ?? '';
      const cursorId =
        requestUrl.searchParams.get('cursorId')?.trim() ?? '';
      if (
        Boolean(cursorCreatedAt) !== Boolean(cursorId) ||
        (cursorCreatedAt &&
          (!Number.isFinite(Date.parse(cursorCreatedAt)) ||
            !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
              cursorId,
            )))
      ) {
        throw new InvalidAdminRequestError(
          'cursor de suporte é inválido.',
        );
      }
      json(
        response,
        200,
        await listSupportTicketsForAdmin({
          repository: driverSupportRepository,
          limit,
          ...(rawStatus
            ? {
                status: rawStatus as
                  | 'open'
                  | 'in_progress'
                  | 'resolved'
                  | 'closed',
              }
            : {}),
          ...(cursorCreatedAt
            ? {
                cursor: {
                  createdAt: new Date(cursorCreatedAt).toISOString(),
                  id: cursorId,
                },
              }
            : {}),
        }),
      );
      return;
    }

    const adminSupportMatch = requestUrl.pathname.match(
      /^\/v1\/admin\/support\/([0-9a-fA-F-]+)$/,
    );
    if (
      request.method === 'PATCH' &&
      adminSupportMatch != null
    ) {
      const actor = await authenticateAdminPrincipal({
        apiKeys: adminRepository,
        humanAuth: adminHumanAuthRepository,
        headers: request.headers,
        requiredScope: 'communications:write',
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      const result = await respondToSupportTicket({
        repository: driverSupportRepository,
        id: adminSupportMatch[1]!,
        response: value.response,
        status: value.status,
      });

      await adminRepository.appendAudit({
        id: randomUUID(),
        actor,
        action: `${result.requesterType}.support.responded`,
        targetType:
          result.requesterType === 'driver'
            ? 'driver_support_ticket'
            : 'passenger_support_ticket',
        targetId: adminSupportMatch[1]!,
        metadata: {
          requesterType: result.requesterType,
          requesterId: result.requesterId,
          ...(result.requesterType === 'driver'
            ? { driverId: result.requesterId }
            : { passengerId: result.requesterId }),
          status: result.ticket.status,
        },
        createdAt: new Date().toISOString(),
      });

      sendPushBestEffort({
        subjectType: result.requesterType,
        subjectId: result.requesterId,
        type: `${result.requesterType}.support.updated`,
        title: 'Suporte Ramo Nessa',
        body: 'Seu chamado recebeu uma atualização.',
        data: { ticketId: adminSupportMatch[1]! },
      });

      json(response, 200, result.ticket);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/passenger/me/support'
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      json(
        response,
        200,
        await listPassengerSupportTickets({
          repository: driverSupportRepository,
          passengerId,
          limit: 50,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/passenger/me/support'
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      const ticket = await createPassengerSupportTicket({
        repository: driverSupportRepository,
        passengerId,
        category: value.category,
        subject: value.subject,
        message: value.message,
      });
      json(response, 201, ticket);
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
      const query = parseAdminAuditQuery(requestUrl.searchParams);
      const page = await adminRepository.searchAudit(query);
      const last = page.records[page.records.length - 1];
      json(response, 200, {
        entries: page.records,
        nextCursor:
          page.hasMore && last != null
            ? encodeAdminAuditCursor({
                createdAt: last.createdAt,
                id: last.id,
              })
            : null,
      });
      return;
    }

    const driverDocumentUploadMatch = requestUrl.pathname.match(
      /^\/v1\/driver\/me\/documents\/(driver_license|vehicle_registration)$/,
    );
    if (
      request.method === 'PUT' &&
      driverDocumentUploadMatch != null
    ) {
      if (privateDocumentStorage == null) {
        json(response, 503, {
          error: 'DOCUMENT_STORAGE_NOT_CONFIGURED',
          message:
            'Storage privado de documentos ainda não está configurado.',
        });
        return;
      }

      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rawContentType = headerValue(request, 'content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      if (
        rawContentType !== 'image/jpeg' &&
        rawContentType !== 'image/png' &&
        rawContentType !== 'application/pdf'
      ) {
        json(response, 415, {
          error: 'UNSUPPORTED_DOCUMENT_TYPE',
          message: 'Envie um arquivo JPEG, PNG ou PDF.',
        });
        return;
      }

      const bytes = await readBinaryBody(
        request,
        MAX_PRIVATE_DOCUMENT_BYTES,
      );
      const expiresOn = headerValue(request, 'x-document-expires-on');
      const result = await submitDriverDocumentFromDriverApp({
        registry: driverRegistryRepository,
        documents: driverDocumentRepository,
        storage: privateDocumentStorage,
        driverId,
        documentType:
          driverDocumentUploadMatch[1]! as DriverDocumentType,
        bytes,
        mimeType: rawContentType,
        ...(expiresOn == null ? {} : { expiresOn }),
      });
      json(response, 201, result);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/documents'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const result = await getDriverDocumentsForAdmin({
        registry: driverRegistryRepository,
        documents: driverDocumentRepository,
        driverId,
      });
      json(response, 200, result);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/support'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      json(
        response,
        200,
        await listDriverSupportTickets({
          repository: driverSupportRepository,
          driverId,
          limit: 50,
        }),
      );
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/v1/driver/me/support'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = await readJson(request);
      const value =
        body != null && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : {};
      const ticket = await createDriverSupportTicket({
        repository: driverSupportRepository,
        driverId,
        category: value.category,
        subject: value.subject,
        message: value.message,
      });
      json(response, 201, ticket);
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/payout-destination'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      json(
        response,
        200,
        await driverPayoutDestinationForApp(
          financeRepository,
          driverId,
        ),
      );
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/driver/me/payout-destination'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = parseDriverPayoutDestinationRequest(
        await readJson(request),
      );
      json(
        response,
        200,
        await saveDriverPayoutDestinationFromApp({
          repository: financeRepository,
          driverId,
          pixKeyType: body.pixKeyType,
          pixKey: body.pixKey,
        }),
      );
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
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/statement'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,3}$/.test(rawLimit)
          ? 50
          : Math.max(1, Math.min(100, Number(rawLimit)));
      const statement = await driverFinanceStatement({
        repository: financeRepository,
        driverId,
        limit,
      });
      json(response, 200, statement);
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

      const payout = result.payout;
      const finance = await driverFinanceSummary(
        financeRepository,
        driverId,
      );

      json(response, 201, {
        payout: {
          id: payout.id,
          amountCents: payout.amountCents,
          requestedAmountCents:
            payout.requestedAmountCents ?? payout.amountCents,
          feeCents: payout.feeCents ?? 0,
          payoutKind: payout.payoutKind ?? 'anticipation',
          status: payout.status,
          pixKeyType: payout.pixKeyType,
          pixKeyMasked:
            payout.pixKey.length > 4
              ? `••••${payout.pixKey.slice(-4)}`
              : '••••',
          createdAt: payout.createdAt,
          updatedAt: payout.updatedAt,
        },
        duplicateRequest: result.duplicateRequest,
        finance,
        actionable: false,
        automated: false,
        providerRetryPending: false,
        message:
          'Antecipação enviada para análise. O Pix só será enviado após aprovação do ADM.',
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
      const documentPolicy = await driverDocumentPolicy(driverId);
      const supply = await updateDriverSupplyFromApp({
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        documents: driverDocumentRepository,
        driverId,
        ...documentPolicy,
        ...body,
      });

      const activeRide =
        await rideRepository.findActiveByDriverId(driverId);
      if (activeRide != null) {
        const tracking = await passengerRideTracking({
          rides: rideRepository,
          drivers: driverSupplyRepository,
          registry: driverRegistryRepository,
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
      requestUrl.pathname === '/v1/driver/me/nearby'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      json(
        response,
        200,
        await nearbyDriversForApp({
          drivers: driverSupplyRepository,
          settings: operationalSettingsRepository,
          driverId,
        }),
      );
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/profile'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      json(
        response,
        200,
        await driverProfileForApp({
          identities: authOtpRepository,
          registry: driverRegistryRepository,
          driverId,
        }),
      );
      return;
    }

    if (
      request.method === 'PUT' &&
      requestUrl.pathname === '/v1/driver/me/photo'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = await readJson(
        request,
        MAX_DRIVER_PROFILE_PHOTO_JSON_BYTES,
      );
      const record =
        body != null && typeof body === 'object'
          ? body as {
              mimeType?: unknown;
              dataBase64?: unknown;
            }
          : {};

      const profile = await updateDriverProfilePhoto({
        registry: driverRegistryRepository,
        driverId,
        mimeType: record.mimeType,
        dataBase64: record.dataBase64,
      });
      json(response, 200, {
        photoPath: driverPhotoPath(
          driverId,
          profile.photoUpdatedAt,
        ),
        photoUpdatedAt: profile.photoUpdatedAt,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/driver/me/activity'
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,2}$/.test(rawLimit)
          ? 20
          : Math.max(1, Math.min(50, Number(rawLimit)));
      const rawFrom = requestUrl.searchParams.get('from');
      const rawTo = requestUrl.searchParams.get('to');
      const from =
        rawFrom == null || rawFrom.trim() === ''
          ? undefined
          : rawFrom.trim();
      const to =
        rawTo == null || rawTo.trim() === ''
          ? undefined
          : rawTo.trim();
      if (
        (from != null && !Number.isFinite(Date.parse(from))) ||
        (to != null && !Number.isFinite(Date.parse(to))) ||
        (
          from != null &&
          to != null &&
          Date.parse(from) >= Date.parse(to)
        )
      ) {
        json(response, 400, {
          error: 'INVALID_ACTIVITY_PERIOD',
          message: 'Período de atividade inválido.',
        });
        return;
      }
      json(
        response,
        200,
        await driverActivityForApp({
          rides: rideRepository,
          finance: financeRepository,
          driverId,
          limit,
          ...(from == null ? {} : { from }),
          ...(to == null ? {} : { to }),
        }),
      );
      return;
    }

    const driverChatMatch = requestUrl.pathname.match(
      /^\/v1\/driver\/me\/rides\/([0-9a-fA-F-]+)\/messages$/,
    );
    if (
      (request.method === 'GET' || request.method === 'POST') &&
      driverChatMatch != null
    ) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rideId = driverChatMatch[1]!;
      const ride = await rideRepository.findById(rideId);
      if (
        ride == null ||
        ride.driverId !== driverId ||
        !RIDE_CHAT_READABLE_STATES.has(ride.state)
      ) {
        json(response, 404, { error: 'RIDE_CHAT_NOT_AVAILABLE' });
        return;
      }

      if (request.method === 'GET') {
        json(response, 200, {
          messages: await rideRepository.listChatMessages(rideId, 100),
        });
        return;
      }

      if (!RIDE_CHAT_WRITABLE_STATES.has(ride.state)) {
        json(response, 409, {
          error: 'RIDE_CHAT_NOT_ACTIVE',
          message: 'O chat fica disponível enquanto a corrida está ativa.',
        });
        return;
      }

      let body: string;
      try {
        body = parseRideChatBody(await readJson(request));
      } catch {
        json(response, 400, {
          error: 'INVALID_RIDE_CHAT_MESSAGE',
          message: 'Mensagem deve ter entre 1 e 1000 caracteres.',
        });
        return;
      }

      const message = await rideRepository.appendChatMessage({
        id: randomUUID(),
        rideId,
        senderType: 'driver',
        senderId: driverId,
        body,
        createdAt: new Date().toISOString(),
      });
      realtimeHub.publishPassengerRide(rideId, {
        type: 'ride.chat.message',
        message,
        serverTime: new Date().toISOString(),
      });
      json(response, 201, { message });
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

    const driverRideCancelMatch = requestUrl.pathname.match(
      /^\/v1\/driver\/me\/rides\/([0-9a-fA-F-]+)\/cancel$/,
    );
    if (request.method === 'POST' && driverRideCancelMatch != null) {
      const driverId = await resolveDriverId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = await readJson(request);
      const record =
        body != null && typeof body === 'object'
          ? body as { reason?: unknown; note?: unknown }
          : {};
      const rideId = driverRideCancelMatch[1]!;
      const cancelled = await cancelDriverRide({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        driverId,
        rideId,
        reason: record.reason,
        ...(typeof record.note === 'string'
          ? { note: record.note }
          : {}),
      });
      const stored = await rideRepository.findById(rideId);
      if (stored == null) {
        throw new DriverAppError(
          'RIDE_NOT_FOUND',
          'Corrida não encontrada após o cancelamento.',
        );
      }

      const refund = await automaticallyRefundRide({
        rides: rideRepository,
        finance: financeRepository,
        gateway: mercadoPagoOrdersClient,
        rideId,
        passengerId: stored.passengerId,
      });

      let adminReviewCreated = false;
      if (
        cancelled.requiresAdminReview &&
        !cancelled.duplicateCancellation
      ) {
        const subject = cancelled.compensationReviewRequired
          ? 'Revisar compensação após cancelamento'
          : 'Revisar ocorrência de segurança';
        const message = [
          `Corrida ${rideId} cancelada pelo motorista.`,
          `Motivo: ${cancelled.reason}.`,
          `Estado anterior: ${cancelled.previousState}.`,
          cancelled.note == null
            ? null
            : `Observação: ${cancelled.note}`,
          cancelled.compensationReviewRequired
            ? 'O passageiro recebeu reembolso integral; avaliar eventual compensação ao motorista separadamente.'
            : 'Revisar a ocorrência e tomar medidas operacionais se necessário.',
        ].filter((item): item is string => item != null).join(' ');

        try {
          await createDriverSupportTicket({
            repository: driverSupportRepository,
            driverId,
            category: 'ride',
            subject,
            message,
          });
          adminReviewCreated = true;
        } catch (supportError) {
          logWarn('driver.ride.cancel.review_ticket_failed', {
            rideId,
            driverId,
            ...errorFields(supportError),
          });
        }
      }

      realtimeHub.publishDriver(driverId, {
        type: 'driver.ride.updated',
        ride: null,
        serverTime: new Date().toISOString(),
      });

      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rideId,
        passengerId: stored.passengerId,
      });
      if (tracking != null) {
        realtimeHub.publishPassengerRide(rideId, {
          type: 'passenger.ride.tracking',
          tracking,
          serverTime: new Date().toISOString(),
        });
      }

      sendPushBestEffort({
        subjectType: 'passenger',
        subjectId: stored.passengerId,
        type: 'passenger.ride.cancelled_by_driver',
        title: 'Corrida cancelada pelo motorista',
        body:
          refund.refundStatus === 'refunded'
            ? 'O valor da corrida foi devolvido integralmente.'
            : refund.refundStatus === 'not_charged'
              ? 'A corrida foi cancelada e nenhum valor foi cobrado.'
              : 'O reembolso integral já foi solicitado e está em processamento.',
        data: { rideId },
      });

      json(response, 200, {
        ride: driverRideView(refund.ride),
        refundStatus: refund.refundStatus,
        adminReviewRequired: cancelled.requiresAdminReview,
        adminReviewCreated,
        compensationReviewRequired:
          cancelled.compensationReviewRequired,
        duplicateCancellation:
          cancelled.duplicateCancellation,
      });
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
          registry: driverRegistryRepository,
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
        const pushContent = action === 'arrive'
          ? ['passenger.ride.driver_arrived', 'Seu motorista chegou',
              'O motorista já está no ponto de embarque.']
          : action === 'start'
            ? ['passenger.ride.started', 'Corrida iniciada',
                'Sua viagem começou.']
            : ['passenger.ride.completed', 'Corrida finalizada',
                'Sua viagem foi finalizada.'];
        sendPushBestEffort({
          subjectType: 'passenger',
          subjectId: ride.passengerId,
          type: pushContent[0]!,
          title: pushContent[1]!,
          body: pushContent[2]!,
          data: { rideId },
        });
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
        documents: driverDocumentRepository,
        matching: rideMatchingRepository,
        finance: financeRepository,
        paymentPolicySettings: paymentPolicySettingsRepository,
        operationalSettings: operationalSettingsRepository,
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
        const documentPolicy = await driverDocumentPolicy(driverId);
        const result = await acceptOfferFromDriverApp({
          rides: rideRepository,
          registry: driverRegistryRepository,
          documents: driverDocumentRepository,
          matching: rideMatchingRepository,
          ...documentPolicy,
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
            registry: driverRegistryRepository,
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
          sendPushBestEffort({
            subjectType: 'passenger',
            subjectId: acceptedRide.passengerId,
            type: 'passenger.ride.driver_accepted',
            title: 'Motorista a caminho',
            body: 'Um motorista aceitou sua corrida.',
            data: { rideId: acceptedRide.id },
          });
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
        finance: financeRepository,
        paymentPolicySettings: paymentPolicySettingsRepository,
        operationalSettings: operationalSettingsRepository,
        canOfferDriver: (candidateDriverId) =>
          canDriverReceiveNewWorkUnderPolicy(candidateDriverId),
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
      const [settings, operationalSettings] = await Promise.all([
        paymentPolicySettingsRepository.get(),
        operationalSettingsRepository.get(),
      ]);
      json(response, 200, {
        ...PAYMENT_POLICY_V1,
        cashEnabled: settings.cashEnabled,
        pixEnabled: settings.pixEnabled,
        cardEnabled: settings.cardEnabled,
        walletEnabled: settings.walletEnabled,
        passengerWalletEnabled: settings.walletEnabled,
        futureCashDebtLimitCents:
          settings.defaultCashDebtLimitCents,
        pixPriceAdjustmentBps: settings.pixPriceAdjustmentBps,
        cardPriceAdjustmentBps: settings.cardPriceAdjustmentBps,
        mercadoPagoPublicKey:
          operationalSettings.mercadoPagoPublicKey ?? null,
        allowedMethods: [
          ...(settings.pixEnabled ? ['pix'] : []),
          ...(settings.cardEnabled ? ['card'] : []),
          ...(settings.walletEnabled ? ['wallet'] : []),
          ...(settings.cashEnabled ? ['cash'] : []),
        ],
      });
      return;
    }

    if (request.method === 'GET' && request.url === '/v1/pricing/policy') {
      const pricing = await resolvePricingCatalogContext({
        versions: pricingCatalogVersionRepository,
      });
      json(response, 200, publicPricingPolicyView(pricing));
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
          period: pricingPeriodAt(
            now,
            pricing.snapshot.periodPolicy,
          ),
        },
        pricing.snapshot,
      );
      json(response, 200, {
        ...publicFareQuoteView(quote),
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

      const verifyPlaceRef = (
        ref: typeof body.quoteRequest.origin,
        point: typeof body.pickup,
        proof: string | undefined,
        field: 'origin' | 'destination',
      ): boolean => {
        const externalProofRequired =
          ref.zoneId === 'external' &&
          ref.localityId !== 'airport-jjd';

        if (proof == null) {
          if (externalProofRequired) {
            throw new PlaceProofError(
              'PLACE_PROOF_INVALID',
              `Selecione novamente o ${field === 'origin' ? 'local de partida' : 'destino'} externo para validar a localidade.`,
            );
          }
          return false;
        }

        if (ref.localityId == null) {
          throw new PlaceProofError(
            'PLACE_PROOF_INVALID',
            `A prova do ${field === 'origin' ? 'local de partida' : 'destino'} não possui localidade compatível.`,
          );
        }

        verifyPlaceProof({
          proof,
          localityId: ref.localityId,
          latitude: point.latitude,
          longitude: point.longitude,
          secret: placeProofSecret,
          now,
        });
        return true;
      };

      const originLocalityProofVerified = verifyPlaceRef(
        body.quoteRequest.origin,
        body.pickup,
        body.pickupPlaceProof,
        'origin',
      );
      const destinationLocalityProofVerified = verifyPlaceRef(
        body.quoteRequest.destination,
        body.dropoff,
        body.dropoffPlaceProof,
        'destination',
      );
      const [pricing, operationalSettings] = await Promise.all([
        resolvePricingCatalogContext({
          versions: pricingCatalogVersionRepository,
          at: now,
        }),
        operationalSettingsRepository.get(),
      ]);
      const ride = await prepareRideForPayment({
        repository: ridePreparationRepository,
        drivers: driverSupplyRepository,
        routing: routingDistanceProvider,
        passengerId,
        quoteRequest: body.quoteRequest,
        pricing,
        pickup: body.pickup,
        dropoff: body.dropoff,
        originLocalityProofVerified,
        destinationLocalityProofVerified,
        holdSeconds: operationalSettings.driverPaymentHoldSeconds,
        canUseDriver: (candidateDriverId) =>
          canDriverReceiveNewWorkUnderPolicy(
            candidateDriverId,
            now,
          ),
        now,
      });

      json(response, 201, {
        ride: passengerRideView(ride),
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
      json(response, 201, passengerRideView(ride));
      return;
    }

    const passengerRetryMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/retry-search$/,
    );
    if (request.method === 'POST' && passengerRetryMatch != null) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const result = await retryPassengerRideSearch({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        matching: rideMatchingRepository,
        passengerId,
        rideId: passengerRetryMatch[1]!,
        finance: financeRepository,
        paymentPolicySettings: paymentPolicySettingsRepository,
        operationalSettings: operationalSettingsRepository,
        canOfferDriver: (candidateDriverId) =>
          canDriverReceiveNewWorkUnderPolicy(candidateDriverId),
      });

      if (result.offer != null) {
        const offerRide =
          await rideRepository.findById(result.offer.rideId);
        if (offerRide != null) {
          realtimeHub.publishDriver(result.offer.driverId, {
            type: 'driver.offer.updated',
            offer: driverOfferView(result.offer, offerRide),
            serverTime: new Date().toISOString(),
          });
        }
      }

      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rideId: result.ride.id,
        passengerId,
      });
      if (tracking != null) {
        realtimeHub.publishPassengerRide(result.ride.id, {
          type: 'passenger.ride.tracking',
          tracking,
          serverTime: new Date().toISOString(),
        });
      }

      json(response, 200, {
        ride: passengerRideView(result.ride),
        dispatchStatus: result.dispatchStatus,
      });
      return;
    }

    const passengerCancelNoDriverMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/cancel-search$/,
    );
    if (
      request.method === 'POST' &&
      passengerCancelNoDriverMatch != null
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const cancelled = await cancelPassengerRideAfterNoDriver({
        rides: rideRepository,
        passengerId,
        rideId: passengerCancelNoDriverMatch[1]!,
      });
      const refund = await automaticallyRefundRide({
        rides: rideRepository,
        finance: financeRepository,
        gateway: mercadoPagoOrdersClient,
        rideId: cancelled.id,
        passengerId,
      });

      const tracking = await passengerRideTracking({
        rides: rideRepository,
        drivers: driverSupplyRepository,
        registry: driverRegistryRepository,
        rideId: refund.ride.id,
        passengerId,
      });
      if (tracking != null) {
        realtimeHub.publishPassengerRide(refund.ride.id, {
          type: 'passenger.ride.tracking',
          tracking,
          serverTime: new Date().toISOString(),
        });
      }

      sendPushBestEffort({
        subjectType: 'passenger',
        subjectId: passengerId,
        type: 'passenger.ride.cancelled_after_no_driver',
        title: 'Corrida cancelada',
        body:
          refund.refundStatus === 'refunded'
            ? 'Sua corrida foi cancelada e o pagamento foi devolvido.'
            : refund.refundStatus === 'not_charged'
              ? 'Sua corrida foi cancelada. Nenhum valor foi cobrado.'
              : 'Sua corrida foi cancelada e o reembolso está em processamento.',
        data: { rideId: refund.ride.id },
      });

      json(response, 200, {
        ride: passengerRideView(refund.ride),
        refundStatus: refund.refundStatus,
        duplicateRefund: refund.duplicateRefund,
      });
      return;
    }

    const passengerChatMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/messages$/,
    );
    if (
      (request.method === 'GET' || request.method === 'POST') &&
      passengerChatMatch != null
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rideId = passengerChatMatch[1]!;
      const ride = await rideRepository.findById(rideId);
      if (
        ride == null ||
        ride.passengerId !== passengerId ||
        !RIDE_CHAT_READABLE_STATES.has(ride.state)
      ) {
        json(response, 404, { error: 'RIDE_CHAT_NOT_AVAILABLE' });
        return;
      }

      if (request.method === 'GET') {
        json(response, 200, {
          messages: await rideRepository.listChatMessages(rideId, 100),
        });
        return;
      }

      if (
        ride.driverId == null ||
        !RIDE_CHAT_WRITABLE_STATES.has(ride.state)
      ) {
        json(response, 409, {
          error: 'RIDE_CHAT_NOT_ACTIVE',
          message: 'O chat fica disponível enquanto a corrida está ativa.',
        });
        return;
      }

      let body: string;
      try {
        body = parseRideChatBody(await readJson(request));
      } catch {
        json(response, 400, {
          error: 'INVALID_RIDE_CHAT_MESSAGE',
          message: 'Mensagem deve ter entre 1 e 1000 caracteres.',
        });
        return;
      }

      const message = await rideRepository.appendChatMessage({
        id: randomUUID(),
        rideId,
        senderType: 'passenger',
        senderId: passengerId,
        body,
        createdAt: new Date().toISOString(),
      });
      realtimeHub.publishDriver(ride.driverId, {
        type: 'ride.chat.message',
        message,
        serverTime: new Date().toISOString(),
      });
      json(response, 201, { message });
      return;
    }

    const rideRatingMatch = requestUrl.pathname.match(
      /^\/v1\/rides\/([0-9a-fA-F-]+)\/rating$/,
    );
    if (request.method === 'POST' && rideRatingMatch != null) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const body = await readJson(request);
      const record =
        body != null && typeof body === 'object'
          ? body as { stars?: unknown }
          : {};
      const result = await submitPassengerDriverRating({
        rides: rideRepository,
        registry: driverRegistryRepository,
        rideId: rideRatingMatch[1]!,
        passengerId,
        stars: Number(record.stars),
      });

      json(response, 200, {
        stars: result.stars,
        ratingAverage: result.ratingAverage,
        ratingCount: result.ratingCount,
        duplicate: result.duplicate,
      });
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
        registry: driverRegistryRepository,
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

      json(response, 200, passengerRideView(ride));
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
      request.method === 'GET' &&
      requestUrl.pathname === '/v1/wallet/topups'
    ) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit =
        rawLimit == null || !/^\d{1,3}$/.test(rawLimit)
          ? 20
          : Math.max(1, Math.min(100, Number(rawLimit)));
      const topups = await financeRepository.listWalletTopups(
        passengerId,
        limit,
      );
      json(response, 200, { topups });
      return;
    }

    const walletTopupMatch = requestUrl.pathname.match(
      /^\/v1\/wallet\/topups\/([0-9a-fA-F-]+)$/,
    );
    if (request.method === 'GET' && walletTopupMatch != null) {
      const passengerId = await resolvePassengerId({
        request,
        sessions: authSessionRepository,
        identities: authOtpRepository,
      });
      const topup = await financeRepository.findWalletTopupById(
        walletTopupMatch[1]!,
      );
      if (topup == null || topup.passengerId !== passengerId) {
        json(response, 404, {
          error: 'WALLET_TOPUP_NOT_FOUND',
          message: 'Recarga não encontrada.',
        });
        return;
      }
      json(response, 200, { topup });
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
      const paymentSettings =
        await paymentPolicySettingsRepository.get();
      if (!paymentSettings.walletEnabled) {
        throw new PaymentDomainError(
          'PAYMENT_METHOD_DISABLED',
          'Carteira está desativada pelo administrador.',
        );
      }
      if (!paymentSettings.pixEnabled) {
        throw new PaymentDomainError(
          'PAYMENT_METHOD_DISABLED',
          'Pix está desativado pelo administrador.',
        );
      }

      const identity = await authOtpRepository.findIdentityBySubject(
        'passenger',
        passengerId,
      );
      const idempotencyKey = readIdempotencyKey(request.headers);


      const result = await createMercadoPagoWalletPixTopup({
        finance: financeRepository,
        gateway: mercadoPagoOrdersClient,
        passengerId,
        identity,
        ...(body.payerEmail == null
          ? {}
          : { payerEmail: body.payerEmail }),
        amountCents: body.amountCents,
        idempotencyKey,
      });
      json(response, 201, {
        topup: result.topup,
        actionable: true,
        action: {
          kind: 'pix',
          orderId: result.pix.orderId,
          ticketUrl: result.pix.ticketUrl,
          qrCode: result.pix.qrCode,
          qrCodeBase64: result.pix.qrCodeBase64,
        },
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
      const paymentSettings =
        await paymentPolicySettingsRepository.get();

      const methodEnabled =
        body.method === 'cash'
          ? paymentSettings.cashEnabled
          : body.method === 'pix'
            ? paymentSettings.pixEnabled
            : body.method === 'card'
              ? paymentSettings.cardEnabled
              : paymentSettings.walletEnabled;
      if (!methodEnabled) {
        throw new PaymentDomainError(
          'PAYMENT_METHOD_DISABLED',
          'A forma de pagamento escolhida está desativada pelo administrador.',
        );
      }

      if (body.method === 'cash') {
        const result = await authorizeCashRide({
          rides: rideRepository,
          settings: paymentPolicySettingsRepository,
          finance: financeRepository,
          rideId: ride.id,
          passengerId,
        });

        let currentRide = result.ride;
        let dispatchStatus:
          | 'SEARCHING_DRIVER'
          | 'NO_DRIVER_FOUND'
          | 'NOT_PREPARED'
          | 'PENDING_RETRY' = 'PENDING_RETRY';

        if (currentRide.state === 'NO_DRIVER_FOUND') {
          dispatchStatus = 'NO_DRIVER_FOUND';
        } else if (
          currentRide.state === 'DRIVER_ASSIGNED' ||
          currentRide.state === 'DRIVER_ARRIVING' ||
          currentRide.state === 'DRIVER_ARRIVED' ||
          currentRide.state === 'IN_PROGRESS' ||
          currentRide.state === 'COMPLETED'
        ) {
          dispatchStatus = 'SEARCHING_DRIVER';
        } else {
          const dispatch = await dispatchRideAfterPayment({
            ride: currentRide,
            rides: rideRepository,
            drivers: driverSupplyRepository,
            matching: rideMatchingRepository,
            finance: financeRepository,
            paymentPolicySettings:
              paymentPolicySettingsRepository,
            operationalSettings: operationalSettingsRepository,
            canOfferDriver: (candidateDriverId) =>
              canDriverReceiveNewWorkUnderPolicy(candidateDriverId),
          });
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
                offer: driverOfferView(
                  dispatch.offer,
                  offerRide,
                ),
                serverTime: new Date().toISOString(),
              });
            }
          }
          currentRide =
            (await rideRepository.findById(ride.id)) ??
            currentRide;
        }

        json(response, 201, {
          authorization: {
            method: 'cash',
            status: 'authorized',
            amountCents: currentRide.quote.totalAmountCents,
          },
          ride: passengerRideView(currentRide),
          dispatchStatus,
          duplicateAuthorization:
            result.duplicateAuthorization,
        });
        return;
      }

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

          if (currentRide.state === 'NO_DRIVER_FOUND') {
            dispatchStatus = 'NO_DRIVER_FOUND';
          } else if (currentRide.state === 'REFUND_PENDING') {
            const refund = await refundWalletRide({
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
                operationalSettings: operationalSettingsRepository,
                canOfferDriver: (candidateDriverId) =>
                  canDriverReceiveNewWorkUnderPolicy(candidateDriverId),
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
              } else if (dispatch.kind === 'NOT_PREPARED') {
                const refund = await refundWalletRide({
                  rides: rideRepository,
                  finance: financeRepository,
                  rideId: ride.id,
                  paymentId: result.payment.id,
                  passengerId,
                });
                currentRide = refund.ride;
                responsePayment = refund.payment;
                duplicateRefund = refund.duplicateRefund;
                dispatchStatus = 'NOT_PREPARED';
              }
            }
          }
        }

        const latestRide =
          (await rideRepository.findById(ride.id)) ?? currentRide;

        const walletBalanceCents = await passengerWalletBalanceCents(
          financeRepository,
          passengerId,
        );

        json(response, 201, {
          payment: responsePayment,
          ride: passengerRideView(latestRide),
          dispatchStatus,
          walletBalanceCents,
          duplicatePayment: result.duplicatePayment,
          duplicateRefund,
        });
        return;
      }

      if (body.method === 'card') {
        const identity =
          await authOtpRepository.findIdentityBySubject(
            'passenger',
            passengerId,
          );

        const result = await createMercadoPagoCardIntent({
          finance: financeRepository,
          gateway: mercadoPagoOrdersClient,
          ride,
          identity,
          ...(body.payerEmail == null
            ? {}
            : { payerEmail: body.payerEmail }),
          cardToken: body.cardToken ?? '',
          paymentMethodId: body.paymentMethodId ?? '',
          paymentMethodType:
            body.paymentMethodType ?? 'credit_card',
          installments: body.installments ?? 1,
          cardPriceAdjustmentBps:
            paymentSettings.cardPriceAdjustmentBps,
          idempotencyKey,
        });

        let responsePayment = result.payment;
        const initialStatus = result.card.status.toLowerCase();

        if (initialStatus !== 'action_required') {
          try {
            const order = await mercadoPagoOrdersClient!.getOrder(
              result.card.orderId,
            );
            const applied = await applyMercadoPagoOrderStatus({
              finance: financeRepository,
              order,
            });
            responsePayment = applied.payment;

            if (applied.kind === 'paid') {
              await processConfirmedMercadoPagoRide(applied.payment);
            } else if (
              applied.kind === 'failed' ||
              applied.kind === 'cancelled'
            ) {
              await markMercadoPagoRidePaymentFailed(applied.payment);
            } else if (applied.kind === 'refunded') {
              await finalizeMercadoPagoRefundedRide(applied.payment);
            }
          } catch (reconciliationError) {
            logWarn('payment.mercado_pago.card_initial_reconciliation_failed', {
              paymentId: result.payment.id,
              orderId: result.card.orderId,
              ...errorFields(reconciliationError),
            });
          }
        }

        const currentRide =
          (await rideRepository.findById(ride.id)) ?? ride;

        json(response, 201, {
          payment: responsePayment,
          pricing: result.pricing,
          card: {
            orderId: result.card.orderId,
            paymentId: result.card.paymentId,
            status: result.card.status,
            statusDetail: result.card.statusDetail,
            ...(result.card.challengeUrl == null
              ? {}
              : { challengeUrl: result.card.challengeUrl }),
          },
          ride: passengerRideView(currentRide),
          paymentConfirmed: responsePayment.status === 'paid',
          simulated: false,
          actionable: true,
        });
        return;
      }

      if (body.method === 'pix') {
        const identity =
          await authOtpRepository.findIdentityBySubject(
            'passenger',
            passengerId,
          );

        const result = await createMercadoPagoPixIntent({
          finance: financeRepository,
          gateway: mercadoPagoOrdersClient,
          ride,
          identity,
          ...(body.payerEmail == null
            ? {}
            : { payerEmail: body.payerEmail }),
          pixPriceAdjustmentBps:
            paymentSettings.pixPriceAdjustmentBps,
          idempotencyKey,
        });

        json(response, 201, {
          payment: result.payment,
          pricing: result.pricing,
          pix: {
            orderId: result.pix.orderId,
            paymentId: result.pix.paymentId,
            status: result.pix.status,
            statusDetail: result.pix.statusDetail,
            ticketUrl: result.pix.ticketUrl,
            qrCode: result.pix.qrCode,
            qrCodeBase64: result.pix.qrCodeBase64,
          },
          simulated: false,
          actionable: true,
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
      error instanceof InvalidDriverFinanceRequestError ||
      error instanceof PushDeviceValidationError
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

    if (error instanceof DriverSupportError) {
      const status =
        error.code === 'SUPPORT_TICKET_NOT_FOUND' ? 404 : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PrivacyError) {
      const status =
        error.code === 'PRIVACY_REQUEST_NOT_FOUND'
          ? 404
          : error.code === 'DUPLICATE_PRIVACY_REQUEST'
            ? 409
            : error.code === 'LEGAL_DOCUMENT_NOT_AVAILABLE'
              ? 409
              : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidCommunicationsRequestError) {
      json(response, 400, {
        error: 'INVALID_COMMUNICATIONS_REQUEST',
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminCommunicationsError) {
      json(response, 409, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminDriverDocumentComplianceError) {
      json(response, 409, {
        error: error.code,
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

    if (error instanceof AdminOperationalSettingsError) {
      json(response, 422, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminPaymentPolicyError) {
      json(response, 409, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminDriverCashPolicyError) {
      const status =
        error.code === 'INVALID_DRIVER_CASH_LIMIT' ? 422 : 409;
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
              error.code === 'PRICING_VERSION_CONFLICT' ||
              error.code === 'PRICING_STRUCTURE_CONFLICT'
            ? 409
            : 400;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminRideCancellationError) {
      const status =
        error.code === 'RIDE_NOT_FOUND'
          ? 404
          : error.code === 'INVALID_CANCELLATION_REASON'
            ? 422
            : 409;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof AdminPassengerError) {
      json(
        response,
        error.code === 'PASSENGER_NOT_FOUND' ? 404 : 422,
        {
          error: error.code,
          message: error.message,
        },
      );
      return;
    }

    if (error instanceof DriverRatingError) {
      const status =
        error.code === 'RIDE_NOT_FOUND'
          ? 404
          : error.code === 'INVALID_RATING'
            ? 422
            : 409;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PassengerProfilePhotoError) {
      const status =
        error.code === 'PASSENGER_IDENTITY_NOT_FOUND'
          ? 404
          : error.code === 'PHOTO_TOO_LARGE'
            ? 413
            : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverProfilePhotoError) {
      const status =
        error.code === 'DRIVER_PROFILE_NOT_FOUND'
          ? 404
          : error.code === 'PHOTO_TOO_LARGE'
            ? 413
            : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverDocumentInspectionError) {
      const status =
        error.code === 'DOCUMENT_INSPECTION_TOKEN_EXPIRED'
          ? 410
          : error.code === 'DOCUMENT_INSPECTION_INTEGRITY_FAILED'
            ? 502
            : 400;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PlaceProofError) {
      const status =
        error.code === 'PLACE_PROOF_CONFIG_INVALID' ? 503 : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PrivateDocumentStorageError) {
      const status =
        error.code === 'DOCUMENT_STORAGE_NOT_FOUND'
          ? 404
          : error.code === 'DOCUMENT_STORAGE_OBJECT_TOO_LARGE'
            ? 502
            : 503;
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
              error.code === 'DOCUMENT_ALREADY_EXPIRED' ||
              error.code === 'DOCUMENT_CONTENT_INVALID' ||
              error.code === 'DOCUMENT_EXPIRATION_INVALID'
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
        case 'INVALID_EMAIL':
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

    if (error instanceof PassengerPasswordAuthError) {
      const status =
        error.code === 'PASSENGER_LOGIN_RATE_LIMITED'
          ? 429
          : error.code === 'PASSENGER_LOGIN_INVALID'
            ? 401
            : error.code === 'PASSENGER_EMAIL_IN_USE'
              ? 409
              : error.code === 'PASSENGER_IDENTITY_NOT_FOUND'
                ? 404
                : 422;
      if (
        error.code === 'PASSENGER_LOGIN_RATE_LIMITED' &&
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
        ...(error.retryAfterSeconds == null
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      });
      return;
    }

    if (error instanceof PassengerSavedPlaceError) {
      const status =
        error.code === 'SAVED_PLACE_NOT_FOUND'
          ? 404
          : error.code === 'SAVED_PLACE_LIMIT'
            ? 409
            : 422;
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

    if (error instanceof DriverCashPolicyError) {
      json(response, 409, {
        error: error.code,
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

    if (error instanceof MercadoPagoPaymentServiceError) {
      const status =
        error.code === 'MERCADO_PAGO_NOT_CONFIGURED'
          ? 503
          : error.code === 'PASSENGER_EMAIL_REQUIRED'
            ? 422
            : 409;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof MercadoPagoWalletTopupError) {
      const status =
        error.code === 'MERCADO_PAGO_NOT_CONFIGURED'
          ? 503
          : error.code === 'PASSENGER_EMAIL_REQUIRED'
            ? 422
            : error.code === 'TOPUP_NOT_FOUND'
              ? 404
              : 409;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverPayoutProviderError) {
      json(response, 503, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof MercadoPagoOrdersError) {
      json(response, 502, {
        error: 'MERCADO_PAGO_UNAVAILABLE',
        message: error.message,
      });
      return;
    }

    if (error instanceof DriverAppError) {
      const status =
        error.code === 'DRIVER_NOT_REGISTERED' ||
        error.code === 'RIDE_NOT_FOUND'
          ? 404
          : error.code === 'DRIVER_REGISTRY_NOT_APPROVED' ||
              error.code === 'DRIVER_DOCUMENTS_NOT_APPROVED'
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

    if (error instanceof AdminPayoutOwnerAuthorizationError) {
      json(
        response,
        error.code === 'PAYOUT_APPROVER_NOT_CONFIGURED' ? 503 : 403,
        {
          error: error.code,
          message: error.message,
        },
      );
      return;
    }

    if (error instanceof AdminPayoutError) {
      const status = error.code === 'PAYOUT_NOT_FOUND' ? 404 : 422;
      json(response, status, {
        error: error.code,
        message: error.message,
      });
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

    if (error instanceof PassengerRideRecoveryError) {
      const status =
        error.code === 'RIDE_NOT_FOUND'
          ? 404
          : error.code === 'RIDE_PASSENGER_MISMATCH'
            ? 403
            : 409;
      json(response, status, {
        error: error.code,
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

    if (error instanceof ExternalRideRefundError) {
      const status =
        error.code === 'RIDE_NOT_FOUND' ||
        error.code === 'PAYMENT_NOT_FOUND'
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
    if (payoutReconciliationTimer != null) {
      clearInterval(payoutReconciliationTimer);
      payoutReconciliationTimer = null;
    }
    if (noDriverDecisionSweepTimer != null) {
      clearInterval(noDriverDecisionSweepTimer);
      noDriverDecisionSweepTimer = null;
    }
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

  if (driverPayoutProvider != null) {
    payoutReconciliationTimer = setInterval(
      () => void runPayoutReconciliation(),
      payoutReconciliationIntervalMs(),
    );
    payoutReconciliationTimer.unref();
    void runPayoutReconciliation();
  }

  noDriverDecisionSweepTimer = setInterval(
    () => void runNoDriverDecisionSweep(),
    60_000,
  );
  noDriverDecisionSweepTimer.unref();
  void runNoDriverDecisionSweep();
});
