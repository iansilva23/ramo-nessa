import type { RideRepository } from '../rides/ride-repository.js';
import { InMemoryRideRepository } from '../rides/repositories/in-memory-ride-repository.js';
import { PostgresRideRepository } from '../rides/repositories/postgres-ride-repository.js';
import { createPostgresPool } from './postgres.js';

export interface RepositoryBundle {
  rideRepository: RideRepository;
  storageMode: 'postgres' | 'memory';
}

export function createRepositories(): RepositoryBundle {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return {
      rideRepository: new PostgresRideRepository(
        createPostgresPool(databaseUrl),
      ),
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
    storageMode: 'memory',
  };
}
