import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

abstract final class DriverMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  // Closer home framing; route fitting can still zoom out when required.
  static const fallbackZoom = 16.0;
  static const recenterMinimumZoom = 16.0;

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
