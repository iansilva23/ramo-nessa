import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/driver_core_config.dart';
import '../../../core/location/driver_location_service.dart';
import '../domain/driver_models.dart';
import 'driver_api.dart';

class HttpDriverApi implements DriverApi {
  HttpDriverApi({
    required Uri baseUrl,
    required String driverId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _driverId = driverId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _driverId;
  final http.Client _client;

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        'x-dev-driver-id': _driverId,
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

  Map<String, dynamic> _expectObject(
    http.Response response, {
    required int expectedStatus,
  }) {
    final dynamic decoded =
        response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);

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
