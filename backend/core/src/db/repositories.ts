import type { RideRepository } from '../rides/ride-repository.js';
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
  rideRepository: RideRepository;
  financeRepository: FinanceRepository;
  driverSupplyRepository: DriverSupplyRepository;
  rideMatchingRepository: RideMatchingRepository;
  storageMode: 'postgres' | 'memory';
}

export function createRepositories(): RepositoryBundle {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const pool = createPostgresPool(databaseUrl);
    const rideRepository = new PostgresRideRepository(pool);
    const driverSupplyRepository =
      new PostgresDriverSupplyRepository(pool);

    return {
      rideRepository,
      financeRepository: new PostgresFinanceRepository(pool),
      driverSupplyRepository,
      rideMatchingRepository: new PostgresRideMatchingRepository(pool),
      storageMode: 'postgres',
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
    rideRepository,
    financeRepository: new InMemoryFinanceRepository(),
    driverSupplyRepository,
    rideMatchingRepository: new InMemoryRideMatchingRepository(
      rideRepository,
      driverSupplyRepository,
    ),
    storageMode: 'memory',
  };
}
