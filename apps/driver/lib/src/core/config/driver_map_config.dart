import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

abstract final class DriverMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  // Closer home framing; route fitting can still zoom out when required.
  static const fallbackZoom = 17.6;
  static const recenterMinimumZoom = fallbackZoom;

  // Native Android/iOS camera-only navigation. This is NOT the Google
  // Navigation SDK and does not change routing, pricing or trip state.
  static const navigationZoom = 18.0;
  static const navigationTilt = 55.0;
  static const homeTilt = navigationTilt;
  static const gestureSettleDelay = Duration(milliseconds: 120);

  /// Bounded, continuous framing from the route already in memory. Never
  /// requests another route or changes the fixed perspective angle.
  static double navigationZoomFor(double? remainingMeters) {
    if (remainingMeters == null || !remainingMeters.isFinite) return navigationZoom;
    return (18.35 - math.log(1 + math.max(0, remainingMeters) / 500) * .32)
        .clamp(17.3, 18.35).toDouble();
  }

  static double? remainingRouteMeters(LatLng position, List<LatLng> points) {
    if (points.length < 2) return null;
    var best = double.infinity, remaining = 0.0, tail = 0.0;
    final scale = math.cos(position.latitude * math.pi / 180);
    for (var i = points.length - 2; i >= 0; i--) {
      final a = points[i], b = points[i + 1];
      final dx = (b.longitude - a.longitude) * scale, dy = b.latitude - a.latitude;
      final sx = (a.longitude - position.longitude) * scale, sy = a.latitude - position.latitude;
      final length2 = dx * dx + dy * dy;
      final t = length2 <= 1e-15 ? 0.0 : ((-sx * dx - sy * dy) / length2).clamp(0.0, 1.0).toDouble();
      final distance2 = math.pow(sx + t * dx, 2) + math.pow(sy + t * dy, 2);
      final segment = distanceMeters(a, b);
      if (distance2 < best) { best = distance2.toDouble(); remaining = tail + segment * (1 - t); }
      tail += segment;
    }
    return remaining;
  }
  static const headingMinTravelMeters = 10.0;
  static const headingMaxTravelMeters = 600.0;

  static double distanceMeters(LatLng from, LatLng to) {
    const radius = 6371000.0;
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final dLat = (to.latitude - from.latitude) * math.pi / 180;
    final dLon = (to.longitude - from.longitude) * math.pi / 180;
    final h = math.pow(math.sin(dLat / 2), 2) +
        math.cos(lat1) * math.cos(lat2) * math.pow(math.sin(dLon / 2), 2);
    return 2 * radius * math.asin(math.sqrt(h.clamp(0.0, 1.0).toDouble()));
  }

  static double bearingDegrees(LatLng from, LatLng to) {
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final dLon = (to.longitude - from.longitude) * math.pi / 180;
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  /// Reject GPS jitter and teleports so the 3D view never spins at a stop.
  static double? courseFromMovement(LatLng from, LatLng to) {
    if (![from.latitude, from.longitude, to.latitude, to.longitude]
            .every((n) => n.isFinite)) {
      return null;
    }
    final travel = distanceMeters(from, to);
    if (travel < headingMinTravelMeters || travel > headingMaxTravelMeters) {
      return null;
    }
    return bearingDegrees(from, to);
  }

  /// First frame can face along the existing route while GPS is stationary.
  /// Ignore routes more than 60 m away instead of pointing along a wrong road.
  static double? routeBearing(LatLng position, List<LatLng> points) {
    if (points.length < 2) return null;
    var closest = double.infinity;
    double? direction;
    final longitudeScale = math.cos(position.latitude * math.pi / 180);
    for (var i = 0; i + 1 < points.length; i++) {
      final a = points[i];
      final b = points[i + 1];
      final sx = (a.longitude - position.longitude) * longitudeScale;
      final sy = a.latitude - position.latitude;
      final dx = (b.longitude - a.longitude) * longitudeScale;
      final dy = b.latitude - a.latitude;
      final length2 = dx * dx + dy * dy;
      if (length2 < 1e-13) continue;
      final t = ((-sx * dx - sy * dy) / length2).clamp(0.0, 1.0).toDouble();
      final distance2 = math.pow(sx + t * dx, 2) + math.pow(sy + t * dy, 2);
      if (distance2 < closest) {
        closest = distance2.toDouble();
        direction = bearingDegrees(a, b);
      }
    }
    if (closest > math.pow(60.0 / 111320.0, 2)) return null;
    return direction;
  }

  static double smoothBearing(double previous, double desired) {
    final delta = (desired - previous + 540) % 360 - 180;
    return (previous + delta * 0.48 + 360) % 360;
  }

  /// Margin around origin/destination, scaled to the actual mobile viewport.
  /// Avoids reserving 110 px on each side of a narrow 320 px screen.
  static double routeEdgePadding(double viewportWidth) {
    if (!viewportWidth.isFinite || viewportWidth <= 0) return 48;
    return math.min(72.0, math.max(32.0, viewportWidth * .16));
  }

  // GPS updates should not steal the camera from an active route preview.
  // Follow the driver when idle or explicitly navigating.
  static bool shouldAutoFollow({
    required bool hasActiveRide,
    required bool navigationMode,
  }) => !hasActiveRide || navigationMode;

  static double recenterZoom(double currentZoom) {
    if (!currentZoom.isFinite) return recenterMinimumZoom;
    return math.max(currentZoom, recenterMinimumZoom);
  }
}
