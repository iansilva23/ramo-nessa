import type { RideRepository } from './ride-repository.js';

export async function passengerActivityForApp(input: {
  rides: RideRepository;
  passengerId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 30));
  const [summary, rides] = await Promise.all([
    input.rides.getAdminPassengerRideSummary(input.passengerId),
    input.rides.listAdminRecentByPassengerId(input.passengerId, limit),
  ]);

  return {
    summary,
    rides: rides.map((ride) => ({
      id: ride.id,
      state: ride.state,
      category: ride.category,
      origin: ride.origin,
      destination: ride.destination,
      totalAmountCents: ride.quote.totalAmountCents,
      paymentMethod: ride.paymentMethod ?? null,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    })),
  };
}
