import '../domain/driver_models.dart';

class DriverRealtimeUpdate {
  const DriverRealtimeUpdate({
    this.offer,
    this.ride,
    this.offerUpdated = false,
    this.rideUpdated = false,
  });

  final DriverOffer? offer;
  final AcceptedDriverRide? ride;
  final bool offerUpdated;
  final bool rideUpdated;
}

abstract interface class DriverRealtimeService {
  Stream<DriverRealtimeUpdate> watch();
}
