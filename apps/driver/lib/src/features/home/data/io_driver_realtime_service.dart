import 'dart:convert';
import 'dart:io';

import '../../../core/config/driver_core_config.dart';
import '../domain/driver_models.dart';
import 'driver_realtime_service.dart';

class IoDriverRealtimeService implements DriverRealtimeService {
  IoDriverRealtimeService({
    required Uri baseUrl,
    required String driverId,
  })  : _baseUrl = baseUrl,
        _driverId = driverId;

  final Uri _baseUrl;
  final String _driverId;

  Uri get _socketUri {
    final scheme = _baseUrl.scheme == 'https' ? 'wss' : 'ws';
    return _baseUrl.replace(
      scheme: scheme,
      path: '/v1/realtime/driver',
      queryParameters: const {},
    );
  }

  @override
  Stream<DriverRealtimeUpdate> watch() async* {
    while (true) {
      WebSocket? socket;
      try {
        socket = await WebSocket.connect(
          _socketUri.toString(),
          headers: {'x-dev-driver-id': _driverId},
        ).timeout(DriverCoreConfig.requestTimeout);

        await for (final message in socket) {
          if (message is! String) continue;
          final decoded = jsonDecode(message);
          if (decoded is! Map<String, dynamic>) continue;

          switch (decoded['type']) {
            case 'driver.bootstrap':
              final offer = decoded['offer'];
              final ride = decoded['ride'];
              yield DriverRealtimeUpdate(
                offer: offer is Map<String, dynamic>
                    ? DriverOffer.fromJson(offer)
                    : null,
                ride: ride is Map<String, dynamic>
                    ? AcceptedDriverRide.fromJson(ride)
                    : null,
                offerUpdated: true,
                rideUpdated: true,
              );
            case 'driver.offer.updated':
              final offer = decoded['offer'];
              yield DriverRealtimeUpdate(
                offer: offer is Map<String, dynamic>
                    ? DriverOffer.fromJson(offer)
                    : null,
                offerUpdated: true,
              );
            case 'driver.ride.updated':
              final ride = decoded['ride'];
              yield DriverRealtimeUpdate(
                ride: ride is Map<String, dynamic>
                    ? AcceptedDriverRide.fromJson(ride)
                    : null,
                rideUpdated: true,
              );
          }
        }
      } catch (_) {
        // O polling HTTP continua ativo como fallback.
      } finally {
        await socket?.close();
      }

      await Future<void>.delayed(const Duration(seconds: 3));
    }
  }
}
