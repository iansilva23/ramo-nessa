import '../domain/driver_models.dart';

class DriverRealtimeUpdate {
  const DriverRealtimeUpdate({
    this.offer,
    this.ride,
    this.offerUpdated = false,
    this.rideUpdated = false,
    this.cancelledRideId,
    this.cancellationFeeCents,
  });

  final DriverOffer? offer;
  final AcceptedDriverRide? ride;
  final bool offerUpdated;
  final bool rideUpdated;
  final String? cancelledRideId;
  final int? cancellationFeeCents;
}

abstract interface class DriverRealtimeService {
  Stream<DriverRealtimeUpdate> watch();
}
