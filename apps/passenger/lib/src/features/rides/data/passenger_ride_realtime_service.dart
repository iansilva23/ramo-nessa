import '../domain/passenger_ride_tracking_snapshot.dart';

abstract interface class PassengerRideRealtimeService {
  Stream<PassengerRideTrackingSnapshot> watch(String rideId);
}
