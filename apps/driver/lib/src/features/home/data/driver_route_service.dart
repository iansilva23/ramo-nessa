import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/driver_core_config.dart';
import '../../../core/config/driver_map_config.dart';
import '../domain/driver_route_info.dart';

abstract interface class DriverRouteService {
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  });
}

class CoreDriverRouteService implements DriverRouteService {
  CoreDriverRouteService({
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
  Future<DriverRouteInfo> route({
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
        .timeout(DriverCoreConfig.requestTimeout);

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
      throw const FormatException('Rota sem pontos suficientes.');
    }

    return DriverRouteInfo(
      points: points,
      distanceMeters: distance.toDouble(),
      duration: Duration(seconds: duration.round()),
    );
  }
}

class OsrmDriverRouteService implements DriverRouteService {
  OsrmDriverRouteService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  @override
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final coordinates =
        '${origin.longitude},${origin.latitude};'
        '${destination.longitude},${destination.latitude}';

    final uri = Uri.parse(
      '${DriverMapConfig.osrmBaseUrl}/route/v1/driving/$coordinates',
    ).replace(
      queryParameters: const {
        'overview': 'full',
        'geometries': 'geojson',
        'steps': 'false',
      },
    );

    final response = await _client
        .get(
          uri,
          headers: const {
            'User-Agent': DriverMapConfig.userAgent,
            'Accept': 'application/json',
          },
        )
        .timeout(DriverMapConfig.requestTimeout);

    if (response.statusCode != 200) {
      throw StateError('Não foi possível calcular a rota agora.');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic> || decoded['code'] != 'Ok') {
      throw StateError('Não encontramos uma rota para esse destino.');
    }

    final routes = decoded['routes'];
    if (routes is! List || routes.isEmpty || routes.first is! Map) {
      throw StateError('Não encontramos uma rota para esse destino.');
    }

    final route = Map<String, dynamic>.from(routes.first as Map);
    final geometry = route['geometry'];
    final coordinatesJson =
        geometry is Map ? geometry['coordinates'] : null;
    if (coordinatesJson is! List) {
      throw const FormatException('Geometria da rota inválida.');
    }

    final points = coordinatesJson
        .whereType<List>()
        .where(
          (coordinate) =>
              coordinate.length >= 2 &&
              coordinate[0] is num &&
              coordinate[1] is num,
        )
        .map(
          (coordinate) => LatLng(
            (coordinate[1] as num).toDouble(),
            (coordinate[0] as num).toDouble(),
          ),
        )
        .toList(growable: false);

    if (points.length < 2) {
      throw const FormatException('Rota sem pontos suficientes.');
    }

    final distance = (route['distance'] as num?)?.toDouble();
    final durationSeconds = (route['duration'] as num?)?.toDouble();
    if (distance == null || durationSeconds == null) {
      throw const FormatException('Distância ou duração inválida.');
    }

    return DriverRouteInfo(
      points: points,
      distanceMeters: distance,
      duration: Duration(seconds: durationSeconds.round()),
    );
  }
}
