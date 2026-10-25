import type { RideRepository } from './ride-repository.js';

export async function passengerActivityForApp(input: {
  rides: RideRepository;
  passengerId: string;
  limit?: number;
  registry?: import('../drivers/driver-registry-repository.js').DriverRegistryRepository;
}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 30));
  const [summary, recent, current] = await Promise.all([
    input.rides.getAdminPassengerRideSummary(input.passengerId),
    input.rides.listAdminRecentByPassengerId(input.passengerId, limit),
    input.rides.findRecoverableByPassengerId(input.passengerId),
  ]);

  const rides = current == null ? recent : [current, ...recent.filter(ride => ride.id !== current.id)];
  return {
    summary,
    rides: await Promise.all(rides.map(async (ride) => ({
      id: ride.id,
      state: ride.state,
      cancellationState: ride.cancellationState ?? null,
      category: ride.category,
      origin: ride.origin,
      destination: ride.destination,
      totalAmountCents: ride.quote.totalAmountCents,
      paymentStatus: ride.paymentStatus,
      driver: ride.driverId && input.registry ? await (async () => {
        const [profile, vehicle] = await Promise.all([input.registry!.findProfile(ride.driverId!), input.registry!.findVehicleByDriverId(ride.driverId!)]);
        return profile ? {name: profile.preferredName || profile.fullName, vehicle: vehicle ? {make: vehicle.make, model: vehicle.model, color: vehicle.color, plate: vehicle.plateNormalized} : null} : null;
      })() : null,
      paymentMethod: ride.paymentMethod ?? null,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    }))),
  };
}
