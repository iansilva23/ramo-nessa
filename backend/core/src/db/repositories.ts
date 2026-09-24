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
import type { DriverSupportRepository } from '../drivers/driver-support-repository.js';
import { InMemoryDriverSupportRepository } from '../drivers/repositories/in-memory-driver-support-repository.js';
import { PostgresDriverSupportRepository } from '../drivers/repositories/postgres-driver-support-repository.js';
import { InMemoryDriverDocumentRepository } from '../drivers/repositories/in-memory-driver-document-repository.js';
import { PostgresDriverDocumentRepository } from '../drivers/repositories/postgres-driver-document-repository.js';
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
import { InMemoryOperationalSettingsRepository } from '../config/in-memory-operational-settings-repository.js';
import { PostgresOperationalSettingsRepository } from '../config/postgres-operational-settings-repository.js';
import { createPostgresPool } from './postgres.js';

export interface RepositoryBundle {
  authSessionRepository: AuthSessionRepository;
  authOtpRepository: AuthOtpRepository;
  adminRepository: AdminRepository;
  adminHumanAuthRepository: AdminHumanAuthRepository;
  rideRepository: RideRepository;
  financeRepository: FinanceRepository;
  paymentPolicySettingsRepository: PaymentPolicySettingsRepository;
  driverSupplyRepository: DriverSupplyRepository;
  driverRegistryRepository: DriverRegistryRepository;
  driverDocumentRepository: DriverDocumentRepository;
  driverSupportRepository: DriverSupportRepository;
  pricingCatalogVersionRepository: PricingCatalogVersionRepository;
  rideMatchingRepository: RideMatchingRepository;
  ridePreparationRepository: RidePreparationRepository;
  pushDeviceRepository: PushDeviceRepository;
  adminCommunicationsRepository: AdminCommunicationsRepository;
  operationalSettingsRepository: OperationalSettingsRepository;
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
      authSessionRepository: new PostgresAuthSessionRepository(pool),
      authOtpRepository: new PostgresAuthOtpRepository(pool),
      adminRepository: new PostgresAdminRepository(pool),
      adminHumanAuthRepository:
        new PostgresAdminHumanAuthRepository(pool),
      rideRepository,
      financeRepository: new PostgresFinanceRepository(pool),
      paymentPolicySettingsRepository:
        new PostgresPaymentPolicySettingsRepository(pool),
      driverSupplyRepository,
      driverRegistryRepository:
        new PostgresDriverRegistryRepository(pool),
      driverDocumentRepository:
        new PostgresDriverDocumentRepository(pool),
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

  const rideRepository = new InMemoryRideRepository();
  const driverSupplyRepository = new InMemoryDriverSupplyRepository();

  return {
    authSessionRepository: new InMemoryAuthSessionRepository(),
    authOtpRepository: new InMemoryAuthOtpRepository(),
    adminRepository: new InMemoryAdminRepository(),
    adminHumanAuthRepository:
      new InMemoryAdminHumanAuthRepository(),
    rideRepository,
    financeRepository: new InMemoryFinanceRepository(),
    paymentPolicySettingsRepository:
      new InMemoryPaymentPolicySettingsRepository(),
    driverSupplyRepository,
    driverRegistryRepository:
      new InMemoryDriverRegistryRepository(),
    driverDocumentRepository:
      new InMemoryDriverDocumentRepository(),
    driverSupportRepository:
      new InMemoryDriverSupportRepository(),
    pricingCatalogVersionRepository:
      new InMemoryPricingCatalogVersionRepository(),
    rideMatchingRepository: new InMemoryRideMatchingRepository(
      rideRepository,
      driverSupplyRepository,
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
    storageMode: 'memory',
    async readinessCheck(): Promise<void> {},
    async close(): Promise<void> {},
  };
}
