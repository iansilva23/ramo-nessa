import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:ramo_realtime/browser_realtime_client.dart';

import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_realtime_service.dart';

class IoPassengerRideRealtimeService implements PassengerRideRealtimeService {
  IoPassengerRideRealtimeService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
  }) : _client = BrowserRealtimeClient(
         baseUrl: baseUrl,
         pageUrl: Uri.base,
         accessToken: accessToken ?? '',
         allowInsecureLocalhost: !kReleaseMode,
       );

  final BrowserRealtimeClient _client;

  @override
  Stream<PassengerRideTrackingSnapshot> watch(String rideId) async* {
    await for (final event in _client.watch('passenger', rideId: rideId)) {
      if (event['type'] != 'passenger.ride.tracking') continue;
      final tracking = event['tracking'];
      if (tracking is! Map<String, dynamic>) continue;
      try {
        yield PassengerRideTrackingSnapshot.fromJson(tracking);
      } catch (_) {
        // Ignore invalid events; authenticated HTTP polling remains active.
      }
    }
  }
}
