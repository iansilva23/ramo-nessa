import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_core_config.dart';
import '../domain/route_info.dart';
import 'route_service.dart';

class CoreRouteService implements RouteService {
  CoreRouteService({
    required Uri baseUrl,
    String? accessToken,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken?.trim() ?? '',
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;

  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/maps/route'),
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            if (_accessToken.isNotEmpty)
              'authorization': 'Bearer $_accessToken',
          },
          body: jsonEncode({
            'origin': {
              'latitude': origin.latitude,
              'longitude': origin.longitude,
            },
            'destination': {
              'latitude': destination.latitude,
              'longitude': destination.longitude,
            },
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException('Resposta de rota inválida.');
    }

    if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
      final message = decoded is Map
          ? decoded['message']?.toString()
          : null;
      throw StateError(
        message?.trim().isNotEmpty == true
            ? message!
            : 'Não foi possível calcular a rota agora.',
      );
    }

    final pointsJson = decoded['points'];
    final distance = decoded['distanceMeters'];
    final duration = decoded['durationSeconds'];
    if (
      pointsJson is! List ||
      distance is! num ||
      duration is! num
    ) {
      throw const FormatException('Rota retornada pelo Core é inválida.');
    }

    final points = pointsJson
        .whereType<Map>()
        .map((raw) => Map<String, dynamic>.from(raw))
        .where(
          (raw) =>
              raw['latitude'] is num &&
              raw['longitude'] is num,
        )
        .map(
          (raw) => LatLng(
            (raw['latitude'] as num).toDouble(),
            (raw['longitude'] as num).toDouble(),
          ),
        )
        .toList(growable: false);

    if (points.length < 2) {
      throw const FormatException(
        'A rota retornada não possui pontos suficientes.',
      );
    }

    return RouteInfo(
      points: points,
      distanceMeters: distance.toDouble(),
      duration: Duration(seconds: duration.round()),
    );
  }
}
