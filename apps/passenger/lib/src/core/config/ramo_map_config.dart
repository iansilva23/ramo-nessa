import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:latlong2/latlong.dart';

abstract final class RamoMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  static const fallbackZoom = 16.5;
  static const locationZoom = 17.0;

  /// Do not move to the pickup point immediately if a route destination
  /// is already selected: route fitting owns the camera in that state.
  /// This avoids a zoom jump while the refreshed route is being calculated.
  static bool shouldCenterOnGpsUpdate({required bool hasDestination}) =>
      !hasDestination;

  /// A list can have several identical points (e.g. zero-distance routes).
  /// Such a list has no useful bounds; the camera should center on one point.
  static bool hasRouteBounds(List<LatLng> coordinates) {
    if (coordinates.length < 2) return false;
    final first = coordinates.first;
    return coordinates.skip(1).any(
      (point) => point.latitude != first.latitude ||
          point.longitude != first.longitude,
    );
  }
}

/// Reserves the actual bottom-sheet height without narrowing the sides.
EdgeInsets ramoHomeMapPadding({
  required Size viewport,
  required double safeTop,
  required double sheetExtent,
  bool hasAgencyBanner = false,
}) {
  final top = math.min(
    safeTop + 76 + (hasAgencyBanner ? 42 : 0),
    viewport.height * .22,
  );
  final bottom = math.min(
    viewport.height * sheetExtent.clamp(0.0, 1.0) + 12,
    math.max(0.0, viewport.height - top - 120),
  );
  return EdgeInsets.fromLTRB(12, top, 12, bottom);
}
