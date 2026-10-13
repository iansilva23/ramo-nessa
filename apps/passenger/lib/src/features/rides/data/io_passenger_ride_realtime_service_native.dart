import 'dart:convert';
import 'dart:io';

import '../../../core/config/ramo_core_config.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_realtime_service.dart';

class IoPassengerRideRealtimeService
    implements PassengerRideRealtimeService {
  IoPassengerRideRealtimeService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? '',
        _passengerId = passengerId ?? RamoCoreConfig.devPassengerId;

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;

  Map<String, dynamic> get _identityHeaders => {
        if (_accessToken.trim().isNotEmpty)
          'authorization': 'Bearer ${_accessToken.trim()}'
        else if (_passengerId.trim().isNotEmpty)
          'x-dev-passenger-id': _passengerId.trim(),
      };

  Uri _socketUri(String rideId) {
    final scheme = _baseUrl.scheme == 'https' ? 'wss' : 'ws';
    return _baseUrl.replace(
      scheme: scheme,
      path: '/v1/realtime/passenger',
      queryParameters: {'rideId': rideId},
    );
  }

  @override
  Stream<PassengerRideTrackingSnapshot> watch(String rideId) async* {
    while (true) {
      WebSocket? socket;
      try {
        socket = await WebSocket.connect(
          _socketUri(rideId).toString(),
          headers: _identityHeaders,
        ).timeout(RamoCoreConfig.requestTimeout);

        await for (final message in socket) {
          if (message is! String) continue;

          try {
            final decoded = jsonDecode(message);
            if (decoded is! Map<String, dynamic>) continue;
            if (decoded['type'] != 'passenger.ride.tracking') continue;

            final tracking = decoded['tracking'];
            if (tracking is Map<String, dynamic>) {
              yield PassengerRideTrackingSnapshot.fromJson(tracking);
            }
          } catch (_) {
            // Ignora somente a mensagem inválida; não derruba o WebSocket.
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
