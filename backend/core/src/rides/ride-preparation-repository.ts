import type { RideRecord } from './ride.js';

export class RidePreparationRepositoryError extends Error {
  constructor(
    public readonly code: 'DRIVER_NOT_AVAILABLE' | 'INVALID_HOLD',
    message: string,
  ) {
    super(message);
    this.name = 'RidePreparationRepositoryError';
  }
}

export interface RidePreparationRepository {
  reserveDriverAndCreateRide(input: {
    ride: RideRecord;
    preparedAt: string;
  }): Promise<RideRecord>;
}
