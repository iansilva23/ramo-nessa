import '../domain/passenger_ride_tracking_snapshot.dart';

abstract interface class PassengerRideTrackingService {
  Future<PassengerRideTrackingSnapshot> tracking(String rideId);
}

class PassengerRideTrackingException implements Exception {
  const PassengerRideTrackingException(this.message);

  final String message;

  @override
  String toString() => message;
}
