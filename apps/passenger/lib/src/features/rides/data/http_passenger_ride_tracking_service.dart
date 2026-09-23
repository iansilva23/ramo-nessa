import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_tracking_service.dart';

class HttpPassengerRideTrackingService
    implements PassengerRideTrackingService {
  HttpPassengerRideTrackingService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? RamoCoreConfig.authToken,
        _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;
  final http.Client _client;

  Map<String, String> get _identityHeaders => {
        'content-type': 'application/json',
        if (_accessToken.trim().isNotEmpty)
          'authorization': 'Bearer ${_accessToken.trim()}'
        else if (_passengerId.trim().isNotEmpty)
          'x-dev-passenger-id': _passengerId.trim(),
      };

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/tracking'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerRideTrackingSnapshot.fromJson(decoded);
      } catch (_) {
        throw const PassengerRideTrackingException(
          'O servidor retornou um rastreamento inválido.',
        );
      }
    }

    throw PassengerRideTrackingException(
      apiErrorMessage(
        decoded,
        'Não conseguimos atualizar sua corrida agora.',
      ),
    );
  }
}
