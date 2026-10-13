import 'dart:async';
import '../../../core/config/ramo_core_config.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_realtime_service.dart';

// Browser WebSocket cannot attach Bearer headers. Do not send access
// tokens via query string. The existing authenticated HTTP tracking polling
// remains in use until a short-lived same-origin WebSocket ticket is added.
class IoPassengerRideRealtimeService implements PassengerRideRealtimeService {
  IoPassengerRideRealtimeService({required Uri baseUrl, String? accessToken, String? passengerId});
  @override
  Stream<PassengerRideTrackingSnapshot> watch(String rideId) => const Stream.empty();
}
