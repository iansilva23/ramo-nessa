import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_core_config.dart';
import 'passenger_saved_place_service.dart';

class HttpPassengerSavedPlaceService
    implements PassengerSavedPlaceService {
  HttpPassengerSavedPlaceService({
    required Uri baseUrl,
    required String accessToken,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;

  Map<String, String> get _headers => {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': 'Bearer $_accessToken',
      };

  @override
  Future<List<PassengerSavedPlace>> list() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/passenger/me/saved-places'),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = _decode(response);
    final items = decoded['items'];
    if (items is! List) {
      throw const PassengerSavedPlaceException(
        'Resposta de favoritos inválida.',
      );
    }

    return items
        .whereType<Map>()
        .map((raw) => Map<String, dynamic>.from(raw))
        .map(PassengerSavedPlace.fromJson)
        .toList(growable: false);
  }

  @override
  Future<PassengerSavedPlace> save({
    required String kind,
    String? label,
    required String name,
    required String address,
    required LatLng position,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/passenger/me/saved-places'),
          headers: _headers,
          body: jsonEncode({
            'kind': kind,
            if (label?.trim().isNotEmpty == true)
              'label': label!.trim(),
            'name': name,
            'address': address,
            'latitude': position.latitude,
            'longitude': position.longitude,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    return PassengerSavedPlace.fromJson(_decode(response));
  }

  @override
  Future<void> delete(String id) async {
    final response = await _client
        .delete(
          _baseUrl.resolve(
            '/v1/passenger/me/saved-places/${Uri.encodeComponent(id)}',
          ),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    if (response.statusCode == 204) return;
    _throwResponse(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const PassengerSavedPlaceException(
        'Resposta de favoritos inválida.',
      );
    }

    if (
      response.statusCode < 200 ||
      response.statusCode >= 300 ||
      decoded is! Map<String, dynamic>
    ) {
      final message = decoded is Map
          ? decoded['message']?.toString().trim()
          : null;
      throw PassengerSavedPlaceException(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível atualizar seus favoritos agora.',
      );
    }

    return decoded;
  }

  Never _throwResponse(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      decoded = null;
    }

    final message = decoded is Map
        ? decoded['message']?.toString().trim()
        : null;
    throw PassengerSavedPlaceException(
      message?.isNotEmpty == true
          ? message!
          : 'Não foi possível atualizar seus favoritos agora.',
    );
  }
}
