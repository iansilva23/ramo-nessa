import type { RideRepository } from '../rides/ride-repository.js';
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
  storageMode: 'postgres' | 'memory';
}

export function createRepositories(): RepositoryBundle {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const pool = createPostgresPool(databaseUrl);
    return {
      rideRepository: new PostgresRideRepository(pool),
      financeRepository: new PostgresFinanceRepository(pool),
      driverSupplyRepository: new PostgresDriverSupplyRepository(pool),
      storageMode: 'postgres',
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatório em produção. Core não iniciará com memória.',
    );
  }

  return {
    rideRepository: new InMemoryRideRepository(),
    financeRepository: new InMemoryFinanceRepository(),
    driverSupplyRepository: new InMemoryDriverSupplyRepository(),
    storageMode: 'memory',
  };
}
