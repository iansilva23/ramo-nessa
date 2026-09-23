import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_tracking_service.dart';

class HttpPassengerRideTrackingService
    implements PassengerRideTrackingService {
  HttpPassengerRideTrackingService({
    required Uri baseUrl,
    required String passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _passengerId = passengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _passengerId;
  final http.Client _client;

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/tracking'),
          headers: {
            'content-type': 'application/json',
            'x-dev-passenger-id': _passengerId,
          },
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded is Map<String, dynamic>) {
      return PassengerRideTrackingSnapshot.fromJson(decoded);
    }

    throw PassengerRideTrackingException(
      decoded is Map<String, dynamic>
          ? decoded['message'] as String? ??
              'Não conseguimos atualizar sua corrida agora.'
          : 'Não conseguimos atualizar sua corrida agora.',
    );
  }
}
