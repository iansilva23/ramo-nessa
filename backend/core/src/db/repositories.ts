import {DriverNavigationControlStore} from '../routing/driver-navigation-control.js';
import {RideOccurrenceStore} from '../rides/ride-occurrence-store.js';
import {MemoryGuideStore,PostgresGuideStore,type GuideStore} from '../guide/guide-store.js';
import {PostgresBoardingStore} from '../rides/boarding-store.js';
import {DocumentExpiryNotifier} from '../drivers/document-expiry.js';
import {PostgresManagementStore,type ManagementStore} from '../costs/company-management.js';
import {PostgresManualCancellationStore} from '../rides/manual-cancellation-store.js';
import { InMemoryAsaasPayoutStore, PostgresAsaasPayoutStore, type AsaasPayoutStore } from '../payments/asaas-payout-store.js';
import { InMemoryGrowthRepository, PostgresGrowthRepository, type GrowthRepository } from '../growth/growth-repository.js';
import { InMemoryCompanyCostRepository, PostgresCompanyCostRepository, type CompanyCostRepository } from '../costs/company-cost-repository.js';
import { InMemorySavedCardRepository, PostgresSavedCardRepository, type SavedCardRepository } from '../payments/saved-card-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type { AdminRepository } from '../admin/admin-repository.js';
import type { AdminHumanAuthRepository } from '../admin/admin-human-auth-repository.js';
import { InMemoryAdminHumanAuthRepository } from '../admin/repositories/in-memory-admin-human-auth-repository.js';
import { PostgresAdminHumanAuthRepository } from '../admin/repositories/postgres-admin-human-auth-repository.js';
import { InMemoryAdminRepository } from '../admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminRepository } from '../admin/repositories/postgres-admin-repository.js';
import { InMemoryAuthSessionRepository } from '../auth/repositories/in-memory-auth-session-repository.js';
import { PostgresAuthSessionRepository } from '../auth/repositories/postgres-auth-session-repository.js';
import { InMemoryAuthOtpRepository } from '../auth/repositories/in-memory-auth-otp-repository.js';
import { PostgresAuthOtpRepository } from '../auth/repositories/postgres-auth-otp-repository.js';
import type { RidePreparationRepository } from '../rides/ride-preparation-repository.js';
import { InMemoryRidePreparationRepository } from '../rides/in-memory-ride-preparation-repository.js';
import { PostgresRidePreparationRepository } from '../rides/postgres-ride-preparation-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import { InMemoryRideMatchingRepository } from '../matching/in-memory-ride-matching-repository.js';
import { PostgresRideMatchingRepository } from '../matching/postgres-ride-matching-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { DriverDocumentRepository } from '../drivers/driver-document-repository.js';
import type { DriverDocumentComplianceRepository } from '../drivers/driver-document-compliance-repository.js';
import type { DriverSupportRepository } from '../drivers/driver-support-repository.js';
import { InMemoryDriverSupportRepository } from '../drivers/repositories/in-memory-driver-support-repository.js';
import { PostgresDriverSupportRepository } from '../drivers/repositories/postgres-driver-support-repository.js';
import { InMemoryDriverDocumentRepository } from '../drivers/repositories/in-memory-driver-document-repository.js';
import { PostgresDriverDocumentRepository } from '../drivers/repositories/postgres-driver-document-repository.js';
import { InMemoryDriverDocumentComplianceRepository } from '../drivers/repositories/in-memory-driver-document-compliance-repository.js';
import { PostgresDriverDocumentComplianceRepository } from '../drivers/repositories/postgres-driver-document-compliance-repository.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import { InMemoryDriverRegistryRepository } from '../drivers/repositories/in-memory-driver-registry-repository.js';
import { PostgresDriverRegistryRepository } from '../drivers/repositories/postgres-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../drivers/repositories/in-memory-driver-supply-repository.js';
import { PostgresDriverSupplyRepository } from '../drivers/repositories/postgres-driver-supply-repository.js';
import type { PricingCatalogVersionRepository } from '../pricing/pricing-catalog-version-repository.js';
import { InMemoryPricingCatalogVersionRepository } from '../pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import { PostgresPricingCatalogVersionRepository } from '../pricing/repositories/postgres-pricing-catalog-version-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { InMemoryFinanceRepository } from '../payments/repositories/in-memory-finance-repository.js';
import { PostgresFinanceRepository } from '../payments/repositories/postgres-finance-repository.js';
import { InMemoryPaymentPolicySettingsRepository } from '../payments/repositories/in-memory-payment-policy-settings-repository.js';
import { PostgresPaymentPolicySettingsRepository } from '../payments/repositories/postgres-payment-policy-settings-repository.js';
import { InMemoryRideRepository } from '../rides/repositories/in-memory-ride-repository.js';
import { PostgresRideRepository } from '../rides/repositories/postgres-ride-repository.js';
import type { PushDeviceRepository } from '../notifications/push-device-repository.js';
import { InMemoryPushDeviceRepository } from '../notifications/repositories/in-memory-push-device-repository.js';
import { PostgresPushDeviceRepository } from '../notifications/repositories/postgres-push-device-repository.js';
import type { AdminCommunicationsRepository } from '../admin/admin-communications-repository.js';
import { InMemoryAdminCommunicationsRepository } from '../admin/repositories/in-memory-admin-communications-repository.js';
import { PostgresAdminCommunicationsRepository } from '../admin/repositories/postgres-admin-communications-repository.js';
import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { PassengerSavedPlaceRepository } from '../passengers/passenger-saved-place-repository.js';
import { InMemoryPassengerSavedPlaceRepository } from '../passengers/repositories/in-memory-passenger-saved-place-repository.js';
import { PostgresPassengerSavedPlaceRepository } from '../passengers/repositories/postgres-passenger-saved-place-repository.js';
import { InMemoryOperationalSettingsRepository } from '../config/in-memory-operational-settings-repository.js';
import { PostgresOperationalSettingsRepository } from '../config/postgres-operational-settings-repository.js';
import type { PrivacyRepository } from '../privacy/privacy-repository.js';
import type { PromotionRepository } from '../promotions/promotion-repository.js';
import { InMemoryPromotionRepository } from '../promotions/repositories/in-memory-promotion-repository.js';
import { PostgresPromotionRepository } from '../promotions/repositories/postgres-promotion-repository.js';
import { InMemoryPrivacyRepository } from '../privacy/repositories/in-memory-privacy-repository.js';
import { PostgresPrivacyRepository } from '../privacy/repositories/postgres-privacy-repository.js';
import type { DriverBenefitRepository } from '../benefits/driver-benefit-repository.js';
import { InMemoryDriverBenefitRepository } from '../benefits/repositories/in-memory-driver-benefit-repository.js';
import { PostgresDriverBenefitRepository } from '../benefits/repositories/postgres-driver-benefit-repository.js';
import { createPostgresPool } from './postgres.js';
import { InMemoryGeoStorageMaintenance, PostgresGeoStorageMaintenance, type GeoStorageMaintenance } from '../places/geo-storage-maintenance.js';
import { InMemoryPassengerGeoLearningStore, PostgresPassengerGeoLearningStore, type PassengerGeoLearningStore } from '../places/passenger-geo-learning.js';
import { InMemoryGeoCatalogRepository, PostgresGeoCatalogRepository, type GeoCatalogRepository } from '../places/geo-catalog-repository.js';

export interface RepositoryBundle {
  driverNavigationControlStore: DriverNavigationControlStore|null;
  boardingStore: PostgresBoardingStore|null;
  occurrenceStore: RideOccurrenceStore|null;
  documentExpiryNotifier: DocumentExpiryNotifier|null;
  manualCancellationStore: PostgresManualCancellationStore | null;
  asaasPayoutStore: AsaasPayoutStore;
  authSessionRepository: AuthSessionRepository;
  authOtpRepository: AuthOtpRepository;
  adminRepository: AdminRepository;
  adminHumanAuthRepository: AdminHumanAuthRepository;
  rideRepository: RideRepository;
  financeRepository: FinanceRepository;
  companyCostRepository: CompanyCostRepository;
  companyManagementStore: ManagementStore|null;
  growthRepository: GrowthRepository;
  paymentPolicySettingsRepository: PaymentPolicySettingsRepository;
  driverSupplyRepository: DriverSupplyRepository;
  driverRegistryRepository: DriverRegistryRepository;
  driverDocumentRepository: DriverDocumentRepository;
  driverDocumentComplianceRepository: DriverDocumentComplianceRepository;
  driverSupportRepository: DriverSupportRepository;
  pricingCatalogVersionRepository: PricingCatalogVersionRepository;
  rideMatchingRepository: RideMatchingRepository;
  ridePreparationRepository: RidePreparationRepository;
  pushDeviceRepository: PushDeviceRepository;
  guideStore: GuideStore;
  adminCommunicationsRepository: AdminCommunicationsRepository;
  operationalSettingsRepository: OperationalSettingsRepository;
  passengerSavedPlaceRepository: PassengerSavedPlaceRepository;
  geoCatalogRepository: GeoCatalogRepository;
  passengerGeoLearningStore: PassengerGeoLearningStore;
  geoStorageMaintenance: GeoStorageMaintenance;
  savedCardRepository: SavedCardRepository;
  privacyRepository: PrivacyRepository;
  promotionRepository: PromotionRepository;
  driverBenefitRepository: DriverBenefitRepository;
  storageMode: 'postgres' | 'memory';
  readinessCheck(): Promise<void>;
  close(): Promise<void>;
}

export function createRepositories(): RepositoryBundle {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const pool = createPostgresPool(databaseUrl);
    const rideRepository = new PostgresRideRepository(pool);
    const driverSupplyRepository =
      new PostgresDriverSupplyRepository(pool);

    return {
      driverNavigationControlStore: new DriverNavigationControlStore(pool),
      boardingStore: new PostgresBoardingStore(pool),
      occurrenceStore: new RideOccurrenceStore(pool),
      documentExpiryNotifier: new DocumentExpiryNotifier(pool),
      manualCancellationStore: new PostgresManualCancellationStore(pool),
      guideStore: new PostgresGuideStore(pool),
      asaasPayoutStore: new PostgresAsaasPayoutStore(pool),
      authSessionRepository: new PostgresAuthSessionRepository(pool),
      authOtpRepository: new PostgresAuthOtpRepository(pool),
      adminRepository: new PostgresAdminRepository(pool),
      adminHumanAuthRepository:
        new PostgresAdminHumanAuthRepository(pool),
      rideRepository,
      financeRepository: new PostgresFinanceRepository(pool),
      companyCostRepository: new PostgresCompanyCostRepository(pool),
      companyManagementStore: new PostgresManagementStore(pool),
      growthRepository: new PostgresGrowthRepository(pool),
      paymentPolicySettingsRepository:
        new PostgresPaymentPolicySettingsRepository(pool),
      driverSupplyRepository,
      driverRegistryRepository:
        new PostgresDriverRegistryRepository(pool),
      driverDocumentRepository:
        new PostgresDriverDocumentRepository(pool),
      driverDocumentComplianceRepository:
        new PostgresDriverDocumentComplianceRepository(pool),
      driverSupportRepository:
        new PostgresDriverSupportRepository(pool),
      pricingCatalogVersionRepository:
        new PostgresPricingCatalogVersionRepository(pool),
      rideMatchingRepository: new PostgresRideMatchingRepository(pool),
      ridePreparationRepository:
        new PostgresRidePreparationRepository(pool),
      pushDeviceRepository: new PostgresPushDeviceRepository(pool),
      adminCommunicationsRepository:
        new PostgresAdminCommunicationsRepository(pool),
      operationalSettingsRepository:
        new PostgresOperationalSettingsRepository(pool),
      passengerSavedPlaceRepository:
        new PostgresPassengerSavedPlaceRepository(pool),
      geoCatalogRepository: new PostgresGeoCatalogRepository(pool),
      passengerGeoLearningStore: new PostgresPassengerGeoLearningStore(pool),
      geoStorageMaintenance: new PostgresGeoStorageMaintenance(pool),
      savedCardRepository: new PostgresSavedCardRepository(pool),
      privacyRepository: new PostgresPrivacyRepository(pool),
      promotionRepository: new PostgresPromotionRepository(pool),
      driverBenefitRepository: new PostgresDriverBenefitRepository(pool),
      storageMode: 'postgres',
      async readinessCheck(): Promise<void> {
        await pool.query('SELECT 1');
      },
      async close(): Promise<void> {
        await pool.end();
      },
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatório em produção. Core não iniciará com memória.',
    );
  }

  const financeRepository = new InMemoryFinanceRepository();
  const adminRepository = new InMemoryAdminRepository();
  const promotionRepository = new InMemoryPromotionRepository();
  const rideRepository = new InMemoryRideRepository();
  const driverSupplyRepository = new InMemoryDriverSupplyRepository();

  return {
    driverNavigationControlStore: null,
    boardingStore: null,
    occurrenceStore: null,
    documentExpiryNotifier: null,
    manualCancellationStore: null,
    asaasPayoutStore: new InMemoryAsaasPayoutStore(),
    authSessionRepository: new InMemoryAuthSessionRepository(),
    authOtpRepository: new InMemoryAuthOtpRepository(),
    adminRepository,
    adminHumanAuthRepository:
      new InMemoryAdminHumanAuthRepository(),
    rideRepository,
    financeRepository,
    companyCostRepository: new InMemoryCompanyCostRepository(financeRepository, adminRepository),
    companyManagementStore: null,
    growthRepository: new InMemoryGrowthRepository(adminRepository),
    paymentPolicySettingsRepository:
      new InMemoryPaymentPolicySettingsRepository(),
    driverSupplyRepository,
    driverRegistryRepository:
      new InMemoryDriverRegistryRepository(),
    driverDocumentRepository:
      new InMemoryDriverDocumentRepository(),
    driverDocumentComplianceRepository:
      new InMemoryDriverDocumentComplianceRepository(),
    driverSupportRepository:
      new InMemoryDriverSupportRepository(),
    pricingCatalogVersionRepository:
      new InMemoryPricingCatalogVersionRepository(),
    rideMatchingRepository: new InMemoryRideMatchingRepository(
      rideRepository,
      driverSupplyRepository,
      promotionRepository,
    ),
    ridePreparationRepository: new InMemoryRidePreparationRepository(
      rideRepository,
      driverSupplyRepository,
    ),
    pushDeviceRepository: new InMemoryPushDeviceRepository(),
    adminCommunicationsRepository:
      new InMemoryAdminCommunicationsRepository(),
    operationalSettingsRepository:
      new InMemoryOperationalSettingsRepository(),
    passengerSavedPlaceRepository:
      new InMemoryPassengerSavedPlaceRepository(),
    geoCatalogRepository: new InMemoryGeoCatalogRepository(),
    passengerGeoLearningStore: new InMemoryPassengerGeoLearningStore(),
    geoStorageMaintenance: new InMemoryGeoStorageMaintenance(),
    savedCardRepository: new InMemorySavedCardRepository(),
    privacyRepository: new InMemoryPrivacyRepository(),
    promotionRepository,
    driverBenefitRepository: new InMemoryDriverBenefitRepository(),
    guideStore: new MemoryGuideStore(),
    storageMode: 'memory',
    async readinessCheck(): Promise<void> {},
    async close(): Promise<void> {},
  };
}
