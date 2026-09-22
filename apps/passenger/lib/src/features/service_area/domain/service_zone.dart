import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

class ServiceZone {
  const ServiceZone({
    required this.id,
    required this.label,
    required this.center,
    required this.radiusMeters,
  });

  final String id;
  final String label;
  final LatLng center;
  final double radiusMeters;

  bool contains(LatLng point) {
    return _distanceMeters(center, point) <= radiusMeters;
  }

  static double _distanceMeters(LatLng a, LatLng b) {
    const earthRadiusMeters = 6371000.0;

    double radians(double degrees) => degrees * math.pi / 180;

    final lat1 = radians(a.latitude);
    final lat2 = radians(b.latitude);
    final deltaLat = radians(b.latitude - a.latitude);
    final deltaLon = radians(b.longitude - a.longitude);

    final haversine = math.pow(math.sin(deltaLat / 2), 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.pow(math.sin(deltaLon / 2), 2);

    final angularDistance =
        2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine));

    return earthRadiusMeters * angularDistance;
  }
}
