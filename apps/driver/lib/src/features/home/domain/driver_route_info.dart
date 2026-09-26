import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

abstract final class MathUtils {
  static double cosDegrees(double degrees) =>
      math.cos(degrees * math.pi / 180);
}

class DriverRouteManeuver {
  const DriverRouteManeuver({
    required this.instruction,
    required this.distanceMeters,
    required this.duration,
    this.verbalInstruction,
    this.type,
    this.beginShapeIndex,
    this.endShapeIndex,
    this.streetNames = const [],
  });

  final String instruction;
  final String? verbalInstruction;
  final int? type;
  final int? beginShapeIndex;
  final int? endShapeIndex;
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

  DriverRouteManeuver? nextManeuverFor(LatLng position) {
    if (maneuvers.isEmpty) return null;
    if (points.isEmpty) return maneuvers.first;

    var nearestIndex = 0;
    var bestScore = double.infinity;
    final longitudeScale =
        MathUtils.cosDegrees(position.latitude).abs();

    for (var index = 0; index < points.length; index += 1) {
      final point = points[index];
      final latitudeDelta = point.latitude - position.latitude;
      final longitudeDelta =
          (point.longitude - position.longitude) * longitudeScale;
      final score =
          latitudeDelta * latitudeDelta +
          longitudeDelta * longitudeDelta;
      if (score < bestScore) {
        bestScore = score;
        nearestIndex = index;
      }
    }

    for (final maneuver in maneuvers) {
      final endIndex = maneuver.endShapeIndex;
      if (endIndex == null || endIndex >= nearestIndex) {
        return maneuver;
      }
    }

    return maneuvers.last;
  }

  String get distanceLabel {
    if (distanceMeters < 1000) {
      return '${distanceMeters.round()} m';
    }
    return '${(distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  }

  String get durationLabel {
    final minutes = duration.inMinutes < 1 ? 1 : duration.inMinutes;
    if (minutes < 60) return '$minutes min';
    final hours = minutes ~/ 60;
    final remaining = minutes % 60;
    return remaining == 0 ? '$hours h' : '$hours h $remaining min';
  }
}
