import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../domain/driver_route_info.dart';

class DriverRouteRefreshPolicy {
  const DriverRouteRefreshPolicy._();

  static const Duration minimumAttemptInterval = Duration(seconds: 15);
  static const Duration onRouteRefreshInterval = Duration(seconds: 90);
  static const double offRouteThresholdMeters = 80;

  static bool shouldRefresh({
    required DateTime now,
    required LatLng currentPosition,
    required DriverRouteInfo? currentRoute,
    required DateTime? lastAttemptAt,
    bool force = false,
  }) {
    if (force || currentRoute == null || lastAttemptAt == null) {
      return true;
    }

    final age = now.difference(lastAttemptAt);
    if (age < minimumAttemptInterval) return false;

    if (
      distanceToRouteMeters(
        currentPosition,
        currentRoute.points,
      ) >=
      offRouteThresholdMeters
    ) {
      return true;
    }

    return age >= onRouteRefreshInterval;
  }

  static double distanceToRouteMeters(
    LatLng point,
    List<LatLng> route,
  ) {
    if (route.isEmpty) return double.infinity;
    if (route.length == 1) {
      return _distanceMeters(point, route.first);
    }

    var best = double.infinity;
    for (var index = 0; index < route.length - 1; index += 1) {
      final distance = _distanceToSegmentMeters(
        point,
        route[index],
        route[index + 1],
      );
      if (distance < best) best = distance;
    }
    return best;
  }

  static double _distanceMeters(LatLng a, LatLng b) {
    final projected = _projectRelativeTo(a, b);
    return math.sqrt(
      projected.$1 * projected.$1 +
          projected.$2 * projected.$2,
    );
  }

  static double _distanceToSegmentMeters(
    LatLng point,
    LatLng start,
    LatLng end,
  ) {
    final startXY = _projectRelativeTo(point, start);
    final endXY = _projectRelativeTo(point, end);
    final dx = endXY.$1 - startXY.$1;
    final dy = endXY.$2 - startXY.$2;
    final lengthSquared = dx * dx + dy * dy;

    if (lengthSquared <= 0.0001) {
      return math.sqrt(
        startXY.$1 * startXY.$1 +
            startXY.$2 * startXY.$2,
      );
    }

    final projection =
        (-(startXY.$1 * dx + startXY.$2 * dy) / lengthSquared)
            .clamp(0.0, 1.0);
    final closestX = startXY.$1 + projection * dx;
    final closestY = startXY.$2 + projection * dy;
    return math.sqrt(
      closestX * closestX + closestY * closestY,
    );
  }

  static (double, double) _projectRelativeTo(
    LatLng origin,
    LatLng point,
  ) {
    const metersPerDegreeLatitude = 110540.0;
    const metersPerDegreeLongitudeAtEquator = 111320.0;
    final latitudeRadians = origin.latitude * math.pi / 180;
    final x =
        (point.longitude - origin.longitude) *
        metersPerDegreeLongitudeAtEquator *
        math.cos(latitudeRadians);
    final y =
        (point.latitude - origin.latitude) *
        metersPerDegreeLatitude;
    return (x, y);
  }
}
