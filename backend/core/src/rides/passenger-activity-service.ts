import type {FinanceRepository} from '../payments/finance-repository.js';
import {checkoutPresentation} from './ride-checkout-presentation.js';
import type { RideRepository } from './ride-repository.js';

export async function passengerActivityForApp(input: {
  rides: RideRepository;
  passengerId: string;
  limit?: number;
  finance?: FinanceRepository;
  now?: Date;
  registry?: import('../drivers/driver-registry-repository.js').DriverRegistryRepository;
}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 30));
  const [summary, recent, current] = await Promise.all([
    input.rides.getAdminPassengerRideSummary(input.passengerId),
    input.rides.listAdminRecentByPassengerId(input.passengerId, limit),
    input.rides.findRecoverableByPassengerId(input.passengerId),
  ]);

  // Parallel queries may straddle a cancellation. Do not let an older recoverable
  // snapshot override the more recent terminal record for the same ID.
  const freshCurrent = current == null ? null : await input.rides.findById(current.id);
  const rides = freshCurrent == null ? recent : [freshCurrent, ...recent.filter(ride => ride.id !== freshCurrent.id)];
  return {
    summary,
    rides: await Promise.all(rides.map(async (ride) => {
      const payment = input.finance == null ? undefined : await input.finance.findLatestPaymentByRideId(ride.id);
      return ({
      id: ride.id,
      ...(payment === undefined ? {state: ride.state} : checkoutPresentation(ride, payment, input.now ?? new Date())),
      cancellationState: ride.cancellationState ?? null,
      category: ride.category,
      origin: ride.origin,
      destination: ride.destination,
      totalAmountCents: ride.quote.totalAmountCents+(ride.occurrenceBonus?.amountCents??0),
      paymentStatus: ride.paymentStatus,
      driver: ride.driverId && input.registry ? await (async () => {
        const [profile, vehicle] = await Promise.all([input.registry!.findProfile(ride.driverId!), input.registry!.findVehicleByDriverId(ride.driverId!)]);
        return profile ? {name: profile.preferredName || profile.fullName, vehicle: vehicle ? {make: vehicle.make, model: vehicle.model, color: vehicle.color, plate: vehicle.plateNormalized} : null} : null;
      })() : null,
      paymentMethod: ride.paymentMethod ?? null,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    });})),
  };
}
