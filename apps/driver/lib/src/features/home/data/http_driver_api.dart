import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/driver_core_config.dart';
import '../../../core/location/driver_location_service.dart';
import '../domain/driver_models.dart';
import 'driver_api.dart';

class HttpDriverApi implements DriverApi {
  HttpDriverApi({
    required Uri baseUrl,
    String? accessToken,
    String? driverId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? '',
        _driverId = driverId ?? DriverCoreConfig.devDriverId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _driverId;
  final http.Client _client;

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        if (_accessToken.trim().isNotEmpty)
          'authorization': 'Bearer ${_accessToken.trim()}'
        else if (_driverId.trim().isNotEmpty)
          'x-dev-driver-id': _driverId.trim(),
      };

  @override
  Future<DriverSupplySnapshot> getSupply() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/driver/me/supply'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);
    return DriverSupplySnapshot.fromJson(
      _expectObject(response, expectedStatus: 200),
    );
  }

  @override
  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  }) async {
    final response = await _client
        .patch(
          _baseUrl.resolve('/v1/driver/me/supply'),
          headers: _headers,
          body: jsonEncode({
            if (online != null) 'online': online,
            if (position != null) ...{
              'latitude': position.latitude,
              'longitude': position.longitude,
            },
          }),
        )
        .timeout(DriverCoreConfig.requestTimeout);

    return DriverSupplySnapshot.fromJson(
      _expectObject(response, expectedStatus: 200),
    );
  }

  @override
  Future<DriverOffer?> currentOffer() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/driver/me/offer'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    final decoded = _expectObject(response, expectedStatus: 200);
    final offer = decoded['offer'];
    if (offer == null) return null;
    return DriverOffer.fromJson(offer as Map<String, dynamic>);
  }

  @override
  Future<AcceptedDriverRide?> currentRide() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/driver/me/ride'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    final decoded = _expectObject(response, expectedStatus: 200);
    final ride = decoded['ride'];
    if (ride == null) return null;
    return AcceptedDriverRide.fromJson(ride as Map<String, dynamic>);
  }

  @override
  Future<AcceptedDriverRide> acceptOffer(String offerId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/driver/me/offers/$offerId/accept'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    final decoded = _expectObject(response, expectedStatus: 200);
    return AcceptedDriverRide.fromJson(
      decoded['ride'] as Map<String, dynamic>,
    );
  }

  @override
  Future<String> rejectOffer(String offerId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/driver/me/offers/$offerId/reject'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    final decoded = _expectObject(response, expectedStatus: 200);
    return decoded['retryStatus'] as String;
  }

  Future<AcceptedDriverRide> _rideAction(
    String rideId,
    String action,
  ) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/driver/me/rides/$rideId/$action'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    final decoded = _expectObject(response, expectedStatus: 200);
    return AcceptedDriverRide.fromJson(
      decoded['ride'] as Map<String, dynamic>,
    );
  }

  @override
  Future<AcceptedDriverRide> markArrived(String rideId) =>
      _rideAction(rideId, 'arrive');

  @override
  Future<AcceptedDriverRide> startRide(String rideId) =>
      _rideAction(rideId, 'start');

  @override
  Future<DriverRideCompletion> completeRide(String rideId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/driver/me/rides/$rideId/complete'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    return DriverRideCompletion.fromJson(
      _expectObject(response, expectedStatus: 200),
    );
  }

  @override
  Future<DriverFinanceSummary> financeSummary() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/driver/me/finance'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);

    return DriverFinanceSummary.fromJson(
      _expectObject(response, expectedStatus: 200),
    );
  }

  @override
  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/driver/me/payouts'),
          headers: {
            ..._headers,
            'idempotency-key': idempotencyKey,
          },
          body: jsonEncode({'amountCents': amountCents}),
        )
        .timeout(DriverCoreConfig.requestTimeout);

    return DriverPayoutReservation.fromJson(
      _expectObject(response, expectedStatus: 201),
    );
  }

  Map<String, dynamic> _expectObject(
    http.Response response, {
    required int expectedStatus,
  }) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const DriverApiException(
        'O servidor retornou uma resposta inválida. Tente novamente.',
      );
    }

    if (
      response.statusCode == expectedStatus &&
      decoded is Map<String, dynamic>
    ) {
      return decoded;
    }

    if (decoded is Map<String, dynamic>) {
      throw DriverApiException(
        decoded['message'] as String? ??
            'Não foi possível concluir esta ação agora.',
      );
    }

    throw const DriverApiException(
      'Não foi possível concluir esta ação agora.',
    );
  }
}
