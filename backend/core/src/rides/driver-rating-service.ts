import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { RideRepository } from './ride-repository.js';

export class DriverRatingError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'RATING_NOT_ALLOWED'
      | 'DRIVER_NOT_ASSIGNED'
      | 'INVALID_RATING',
    message: string,
  ) {
    super(message);
    this.name = 'DriverRatingError';
  }
}

export async function submitPassengerDriverRating(input: {
  rides: RideRepository;
  registry: DriverRegistryRepository;
  rideId: string;
  passengerId: string;
  stars: number;
  now?: Date;
}) {
  if (
    !Number.isInteger(input.stars) ||
    input.stars < 1 ||
    input.stars > 5
  ) {
    throw new DriverRatingError(
      'INVALID_RATING',
      'A avaliação precisa ter de 1 a 5 estrelas.',
    );
  }

  const ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) {
    throw new DriverRatingError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }
  if (ride.state !== 'COMPLETED') {
    throw new DriverRatingError(
      'RATING_NOT_ALLOWED',
      'A avaliação só fica disponível depois da corrida concluída.',
    );
  }
  if (ride.driverId == null) {
    throw new DriverRatingError(
      'DRIVER_NOT_ASSIGNED',
      'Esta corrida não possui motorista para avaliar.',
    );
  }

  return input.registry.submitRating({
    rideId: ride.id,
    passengerId: input.passengerId,
    driverId: ride.driverId,
    stars: input.stars,
    createdAt: (input.now ?? new Date()).toISOString(),
  });
}
