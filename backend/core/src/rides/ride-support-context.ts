import type { RideRepository } from './ride-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import { DriverSupportError } from '../drivers/driver-support-service.js';

export interface RideActivityEvent {
  state: string;
  paymentStatus: string;
  recordedAt: string;
  driverId: string | null;
  vehicleSnapshot: {id:string;plate:string;make:string;model:string;color:string} | null;
  driverLocation: {latitude: number; longitude: number; observedAt: string; accuracyMeters: number | null} | null;
}
export interface RideSupportDependencies {
  rides: RideRepository;
  finance: FinanceRepository;
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
}

/** Only server records become evidence; never accept a client-supplied snapshot. */
export async function rideSupportContext(input: RideSupportDependencies & {
  rideId: unknown; requesterType: 'passenger' | 'driver'; requesterId: string; now?: Date;
}) {
  if (input.rideId == null) return undefined;
  if (typeof input.rideId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.rideId)) {
    throw new DriverSupportError('SUPPORT_RIDE_UNAVAILABLE', 'Corrida indisponível para este atendimento.');
  }
  const ride = await input.rides.findById(input.rideId);
  if (ride == null || (input.requesterType === 'passenger' ? ride.passengerId : ride.driverId) !== input.requesterId) {
    throw new DriverSupportError('SUPPORT_RIDE_UNAVAILABLE', 'Corrida indisponível para este atendimento.');
  }
  const [payment, events, profile, vehicle] = await Promise.all([
    input.finance.findLatestPaymentByRideId(ride.id),
    input.rides.listActivityEvents?.(ride.id) ?? Promise.resolve([]),
    ride.driverId ? input.registry.findProfile(ride.driverId) : null,
    ride.driverId ? input.registry.findVehicleByDriverId(ride.driverId) : null,
  ]);
  return {
    rideId: ride.id,
    capturedAt: (input.now ?? new Date()).toISOString(),
    ride: {id: ride.id, passengerId: ride.passengerId, driverId: ride.driverId ?? null,
      state: ride.state, category: ride.category, origin: ride.origin, destination: ride.destination,
      pickupInstructions: ride.pickupInstructions ?? null, dropoffInstructions: ride.dropoffInstructions ?? null,
      pickupLatitude: ride.pickupLatitude ?? null, pickupLongitude: ride.pickupLongitude ?? null,
      dropoffLatitude: ride.dropoffLatitude ?? null, dropoffLongitude: ride.dropoffLongitude ?? null,
      createdAt: ride.createdAt, updatedAt: ride.updatedAt, totalAmountCents: ride.quote.totalAmountCents,
      paymentStatus: ride.paymentStatus, paymentMethod: ride.paymentMethod ?? null},
    driver: profile ? {id: profile.driverId, name: profile.preferredName || profile.fullName} : null,
    vehicle: vehicle ? {id: vehicle.id, plate: vehicle.plateNormalized, make: vehicle.make, model: vehicle.model, color: vehicle.color} : null,
    payment: payment ? {id: payment.id, status: payment.status, method: payment.method,
      amountCents: payment.amountCents, createdAt: payment.createdAt, updatedAt: payment.updatedAt} : null,
    events,
    evidenceNote: 'Chegada informada e GPS não comprovam sozinhos a presença física. Localizações são registros do dispositivo, com o horário da observação. Precisão ausente não é estimada. Eventos anteriores à implantação podem não estar disponíveis.',
  };
}
export type RideSupportContext = NonNullable<Awaited<ReturnType<typeof rideSupportContext>>>;
