import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideRepository } from './ride-repository.js';
import {
  RidePreparationRepositoryError,
  type RidePreparationRepository,
} from './ride-preparation-repository.js';
import type { RideRecord } from './ride.js';

export class InMemoryRidePreparationRepository
    implements RidePreparationRepository {
  constructor(
    private readonly rides: RideRepository,
    private readonly drivers: DriverSupplyRepository,
  ) {}

  async reserveDriverAndCreateRide(input: {
    ride: RideRecord;
    preparedAt: string;
  }): Promise<RideRecord> {
    const driverId = input.ride.reservedDriverId;
    const holdExpiresAt = input.ride.driverHoldExpiresAt;

    if (driverId == null || holdExpiresAt == null) {
      throw new RidePreparationRepositoryError(
        'INVALID_HOLD',
        'Corrida preparada precisa de motorista e validade da reserva.',
      );
    }

    const driver = await this.drivers.findByDriverId(driverId);
    const preparedAtMs = Date.parse(input.preparedAt);
    const activeReservation =
      driver?.reservedRideId != null &&
      driver.reservedUntil != null &&
      Date.parse(driver.reservedUntil) > preparedAtMs &&
      driver.reservedRideId !== input.ride.id;

    if (
      driver == null ||
      !driver.online ||
      driver.busy ||
      activeReservation
    ) {
      throw new RidePreparationRepositoryError(
        'DRIVER_NOT_AVAILABLE',
        'Motorista não está disponível para reserva de pagamento.',
      );
    }

    const ride = await this.rides.create(input.ride);
    await this.drivers.upsert({
      ...driver,
      reservedRideId: ride.id,
      reservedUntil: holdExpiresAt,
      updatedAt: input.preparedAt,
    });

    return ride;
  }
}
