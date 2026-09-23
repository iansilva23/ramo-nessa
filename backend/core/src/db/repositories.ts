import type { RideRepository } from '../rides/ride-repository.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type { AdminRepository } from '../admin/admin-repository.js';
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
import { InMemoryDriverSupplyRepository } from '../drivers/repositories/in-memory-driver-supply-repository.js';
import { PostgresDriverSupplyRepository } from '../drivers/repositories/postgres-driver-supply-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import { InMemoryFinanceRepository } from '../payments/repositories/in-memory-finance-repository.js';
import { PostgresFinanceRepository } from '../payments/repositories/postgres-finance-repository.js';
import { InMemoryRideRepository } from '../rides/repositories/in-memory-ride-repository.js';
import { PostgresRideRepository } from '../rides/repositories/postgres-ride-repository.js';
import { createPostgresPool } from './postgres.js';

export interface RepositoryBundle {
  authSessionRepository: AuthSessionRepository;
  authOtpRepository: AuthOtpRepository;
  adminRepository: AdminRepository;
  rideRepository: RideRepository;
  financeRepository: FinanceRepository;
  driverSupplyRepository: DriverSupplyRepository;
  rideMatchingRepository: RideMatchingRepository;
  ridePreparationRepository: RidePreparationRepository;
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
      rideRepository,
      financeRepository: new PostgresFinanceRepository(pool),
      driverSupplyRepository,
      rideMatchingRepository: new PostgresRideMatchingRepository(pool),
      ridePreparationRepository:
        new PostgresRidePreparationRepository(pool),
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
    rideRepository,
    financeRepository: new InMemoryFinanceRepository(),
    driverSupplyRepository,
    rideMatchingRepository: new InMemoryRideMatchingRepository(
      rideRepository,
      driverSupplyRepository,
    ),
    ridePreparationRepository: new InMemoryRidePreparationRepository(
      rideRepository,
      driverSupplyRepository,
    ),
    storageMode: 'memory',
    async readinessCheck(): Promise<void> {},
    async close(): Promise<void> {},
  };
}
