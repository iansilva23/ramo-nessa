import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:ramo_realtime/browser_realtime_client.dart';

import '../domain/driver_models.dart';
import 'driver_realtime_service.dart';

class IoDriverRealtimeService implements DriverRealtimeService {
  IoDriverRealtimeService({
    required Uri baseUrl,
    String? accessToken,
    String? driverId,
  }) : _client = BrowserRealtimeClient(
         baseUrl: baseUrl,
         pageUrl: Uri.base,
         accessToken: accessToken ?? '',
         allowInsecureLocalhost: !kReleaseMode,
       );

  final BrowserRealtimeClient _client;

  @override
  Stream<DriverRealtimeUpdate> watch() async* {
    await for (final event in _client.watch('driver')) {
      final type = event['type'];
      if (!const {
        'driver.bootstrap',
        'driver.offer.updated',
        'driver.ride.updated',
      }.contains(type)) {
        continue;
      }
      final offer = event['offer'];
      final ride = event['ride'];
      try {
        yield DriverRealtimeUpdate(
          cancelledRideId:event['cancelledRideId'] as String?,
          cancellationFeeCents:(event['cancellationFeeCents'] as num?)?.toInt(),
          offer: offer is Map<String, dynamic>
              ? DriverOffer.fromJson(offer)
              : null,
          ride: ride is Map<String, dynamic>
              ? AcceptedDriverRide.fromJson(ride)
              : null,
          offerUpdated:
              type == 'driver.bootstrap' || type == 'driver.offer.updated',
          rideUpdated:
              type == 'driver.bootstrap' || type == 'driver.ride.updated',
        );
      } catch (_) {
        // Ignore invalid events; authenticated HTTP polling remains active.
      }
    }
  }
}
