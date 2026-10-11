import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:latlong2/latlong.dart';

abstract final class RamoMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  static const fallbackZoom = 16.5;
  static const locationZoom = 17.0;
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
