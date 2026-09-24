import 'package:latlong2/latlong.dart';

class DriverRouteManeuver {
  const DriverRouteManeuver({
    required this.instruction,
    required this.distanceMeters,
    required this.duration,
    this.verbalInstruction,
    this.type,
    this.streetNames = const [],
  });

  final String instruction;
  final String? verbalInstruction;
  final int? type;
  final double distanceMeters;
  final Duration duration;
  final List<String> streetNames;

  String get distanceLabel {
    if (distanceMeters < 1000) {
      return '${distanceMeters.round()} m';
    }
    return '${(distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  }
}

class DriverRouteInfo {
  const DriverRouteInfo({
    required this.points,
    required this.distanceMeters,
    required this.duration,
    this.maneuvers = const [],
  });

  final List<LatLng> points;
  final double distanceMeters;
  final Duration duration;
  final List<DriverRouteManeuver> maneuvers;

  DriverRouteManeuver? get nextManeuver =>
      maneuvers.isEmpty ? null : maneuvers.first;

  String get distanceLabel {
    if (distanceMeters < 1000) {
      return '${distanceMeters.round()} m';
    }
    return '${(distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  }

  String get durationLabel {
    final minutes = duration.inMinutes < 1 ? 1 : duration.inMinutes;
    if (minutes < 60) return '${minutes} min';
    final hours = minutes ~/ 60;
    final remaining = minutes % 60;
    return remaining == 0 ? '${hours}h' : '${hours}h ${remaining}min';
  }
}
