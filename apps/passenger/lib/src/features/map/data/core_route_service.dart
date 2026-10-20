import 'dart:convert';
import 'dart:math' as math;

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

  static bool _validPoint(LatLng point) =>
      point.latitude.isFinite &&
      point.longitude.isFinite &&
      point.latitude.abs() <= 90 &&
      point.longitude.abs() <= 180 &&
      (point.latitude != 0 || point.longitude != 0);

  static double _straightMeters(LatLng from, LatLng to) {
    const radius = 6371000.0;
    final latitudeDelta = (to.latitude - from.latitude) * math.pi / 180;
    final longitudeDelta = (to.longitude - from.longitude) * math.pi / 180;
    final latitude1 = from.latitude * math.pi / 180;
    final latitude2 = to.latitude * math.pi / 180;
    final a = math.pow(math.sin(latitudeDelta / 2), 2) +
        math.cos(latitude1) * math.cos(latitude2) *
            math.pow(math.sin(longitudeDelta / 2), 2);
    return 2 * radius * math.asin(math.sqrt(a.clamp(0.0, 1.0)));
  }

  static List<LatLng> _validatedPoints(dynamic rawPoints, double distanceMeters) {
    if (rawPoints is! List || rawPoints.length < 2 || rawPoints.length > 10000) {
      throw const FormatException('A rota retornada possui geometria inválida.');
    }
    final points = <LatLng>[];
    var minimumDistance = 0.0;
    for (final raw in rawPoints) {
      if (raw is! Map || raw['latitude'] is! num ||
          raw['longitude'] is! num) {
        throw const FormatException('A rota retornada possui pontos inválidos.');
      }
      final point = LatLng(
        (raw['latitude'] as num).toDouble(),
        (raw['longitude'] as num).toDouble(),
      );
      if (!_validPoint(point)) {
        throw const FormatException('A rota retornada possui GPS inválido.');
      }
      if (points.isNotEmpty) {
        minimumDistance += _straightMeters(points.last, point);
      }
      points.add(point);
    }
    // A straight-line chord between adjacent points cannot be longer than
    // the reported drivable route. Allow provider tolerance and map snapping.
    if (minimumDistance > distanceMeters * 1.25 + 1000) {
      throw const FormatException('A geometria não corresponde à distância da rota.');
    }
    return List<LatLng>.unmodifiable(points);
  }

  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    if (!_validPoint(origin) || !_validPoint(destination)) {
      throw const FormatException('Origem ou destino com GPS inválido.');
    }
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

    final distance = decoded['distanceMeters'];
    final duration = decoded['durationSeconds'];
    if (distance is! num || duration is! num ||
        !distance.toDouble().isFinite || distance < 0 ||
        !duration.toDouble().isFinite ||
        duration < 0 || duration > 31536000) {
      throw const FormatException('Distância ou duração de rota inválida.');
    }
    final points = _validatedPoints(
      decoded['points'],
      distance.toDouble(),
    );
    return RouteInfo(
      points: points,
      distanceMeters: distance.toDouble(),
      duration: Duration(seconds: duration.round()),
    );
  }
}
