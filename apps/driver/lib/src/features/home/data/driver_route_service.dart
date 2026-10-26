import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/driver_core_config.dart';
import '../domain/driver_route_info.dart';

abstract interface class DriverRouteService {
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  });
}

class DriverNavigationControl {
  const DriverNavigationControl({required this.mode,required this.recalculations,required this.pickupRequested,required this.dropoffRequested,this.enabled=false});
  final bool enabled;
  final String mode;
  final int recalculations;
  final bool pickupRequested;
  final bool dropoffRequested;
  factory DriverNavigationControl.fromJson(Map raw) => DriverNavigationControl(
    enabled: raw['enabled']==true, mode: raw['mode'] as String, recalculations: (raw['recalculations'] as num).toInt(),
    pickupRequested: raw['pickupRequested'] == true, dropoffRequested: raw['dropoffRequested'] == true);
}
class DriverRouteControlException implements Exception {
  const DriverRouteControlException(this.code, [this.control]);
  final String code;
  final DriverNavigationControl? control;
}
abstract interface class ControlledDriverRouteService implements DriverRouteService {
  DriverNavigationControl? get latestControl;
  Future<DriverNavigationControl> navigationState(String rideId);
  Future<DriverNavigationControl> setNavigationMode(String rideId,String mode);
  Future<DriverRouteInfo> rideRoute({required String rideId,required LatLng origin,required LatLng destination,required String reason});
}
class CoreDriverRouteService implements ControlledDriverRouteService {
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
    // Chords cannot exceed the route reported by the provider. Allow
    // snapping and reasonable provider rounding, but not other-state jumps.
    if (minimumDistance > distanceMeters * 1.25 + 1000) {
      throw const FormatException('A geometria não corresponde à distância da rota.');
    }
    return List<LatLng>.unmodifiable(points);
  }

  @override
  DriverNavigationControl? latestControl;

  Future<DriverNavigationControl> _control(String rideId,[String? mode]) async {
    final uri=_baseUrl.resolve('/v1/driver/me/rides/$rideId/navigation');
    final headers={'authorization':'Bearer $_accessToken','content-type':'application/json'};
    final response=await (mode==null ? _client.get(uri,headers:headers) :
      _client.post(uri,headers:headers,body:jsonEncode({'mode':mode}))).timeout(DriverCoreConfig.requestTimeout);
    final raw=jsonDecode(response.body);
    final control=raw is Map && raw['control'] is Map ? DriverNavigationControl.fromJson(raw['control'] as Map) : null;
    if(control!=null) latestControl=control;
    if(response.statusCode!=200||control==null) throw DriverRouteControlException(raw is Map ? raw['error']?.toString()??'NAVIGATION_UNAVAILABLE':'NAVIGATION_UNAVAILABLE',control);
    return control;
  }
  @override
  Future<DriverNavigationControl> navigationState(String rideId)=>_control(rideId);
  @override
  Future<DriverNavigationControl> setNavigationMode(String rideId,String mode)=>_control(rideId,mode);
  @override
  Future<DriverRouteInfo> rideRoute({required String rideId,required LatLng origin,required LatLng destination,required String reason})=>
    _requestRoute(origin:origin,destination:destination,path:'/v1/driver/me/rides/$rideId/navigation/route',reason:reason);
  @override
  Future<DriverRouteInfo> route({required LatLng origin,required LatLng destination})=>_requestRoute(origin:origin,destination:destination);

  Future<DriverRouteInfo> _requestRoute({required LatLng origin,required LatLng destination,String path='/v1/maps/route',String? reason}) async {
    if (!_validPoint(origin) || !_validPoint(destination)) {
      throw const FormatException('Origem ou destino com GPS inválido.');
    }
    final response = await _client
        .post(
          _baseUrl.resolve(path),
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            if (_accessToken.isNotEmpty)
              'authorization': 'Bearer $_accessToken',
          },
          body: jsonEncode({
            if(reason!=null) 'reason':reason,
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

    if(decoded is Map && decoded['control'] is Map) latestControl=DriverNavigationControl.fromJson(decoded['control'] as Map);
    if(reason!=null && response.statusCode!=200) throw DriverRouteControlException(decoded is Map ? decoded['error']?.toString()??'NAVIGATION_UNAVAILABLE':'NAVIGATION_UNAVAILABLE',latestControl);
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
    final points = _validatedPoints(decoded['points'], distance.toDouble());

    final maneuversJson = decoded['maneuvers'];
    final maneuvers = maneuversJson is List
        ? maneuversJson
            .whereType<Map>()
            .map((raw) => Map<String, dynamic>.from(raw))
            .where((raw) => raw['instruction'] is String)
            .map(
              (raw) => DriverRouteManeuver(
                instruction: (raw['instruction'] as String).trim(),
                verbalInstruction:
                    (raw['verbalInstruction'] as String?)?.trim(),
                type: (raw['type'] as num?)?.toInt(),
                beginShapeIndex:
                    (raw['beginShapeIndex'] as num?)?.toInt(),
                endShapeIndex:
                    (raw['endShapeIndex'] as num?)?.toInt(),
                distanceMeters:
                    (raw['distanceMeters'] as num?)?.toDouble() ?? 0,
                duration: Duration(
                  seconds:
                      (raw['durationSeconds'] as num?)?.round() ?? 0,
                ),
                streetNames: raw['streetNames'] is List
                    ? (raw['streetNames'] as List)
                        .whereType<String>()
                        .toList(growable: false)
                    : const [],
              ),
            )
            .toList(growable: false)
        : const <DriverRouteManeuver>[];

    return DriverRouteInfo(
      points: points,
      distanceMeters: distance.toDouble(),
      duration: Duration(seconds: duration.round()),
      maneuvers: maneuvers,
      estimatedFromLastRoute: reason != null,
    );
  }
}
