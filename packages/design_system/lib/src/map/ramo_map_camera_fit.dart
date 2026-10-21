import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'ramo_route_motion.dart';

/// A complete Web camera target, computed before touching the Maps SDK.
/// Web fitBounds can animate even through moveCamera; reading its zoom
/// immediately and issuing zoomTo races that unfinished animation.
class RamoMapCameraFit {
  const RamoMapCameraFit(this.center, this.zoom);

  final RamoMapPoint center;
  final double zoom;

  static RamoMapCameraFit? calculate({
    required List<RamoMapPoint> points,
    required Size viewport,
    EdgeInsets padding = EdgeInsets.zero,
    double edgePadding = 24,
    double minZoom = 4,
    double maxZoom = 17,
  }) {
    if (points.isEmpty || !viewport.width.isFinite ||
        !viewport.height.isFinite || !edgePadding.isFinite || edgePadding < 0 ||
        !minZoom.isFinite || !maxZoom.isFinite || minZoom > maxZoom ||
        [padding.left, padding.top, padding.right, padding.bottom]
            .any((value) => !value.isFinite || value < 0)) return null;
    final width = viewport.width - padding.horizontal - edgePadding * 2;
    final height = viewport.height - padding.vertical - edgePadding * 2;
    if (width <= 0 || height <= 0) return null;
    if (points.any((p) => !p.latitude.isFinite || !p.longitude.isFinite ||
        p.latitude.abs() > 90 || p.longitude.abs() > 180)) return null;

    // Use the shortest longitude interval, including trips across +/-180.
    final xs = points.map((p) => (p.longitude + 180) / 360).toList()..sort();
    var gap = -1.0;
    var start = xs.first;
    for (var i = 0; i < xs.length; i++) {
      final next = i + 1 < xs.length ? xs[i + 1] : xs.first + 1;
      if (next - xs[i] > gap) {
        gap = next - xs[i];
        start = next % 1;
      }
    }
    final spanX = math.max(0.0, 1 - gap);
    double projectY(double latitude) {
      final radians = latitude.clamp(-85.05112878, 85.05112878) * math.pi / 180;
      return (1 - math.log(math.tan(math.pi / 4 + radians / 2)) / math.pi) / 2;
    }
    final ys = points.map((p) => projectY(p.latitude));
    final minY = ys.reduce(math.min), maxY = ys.reduce(math.max);
    final spanY = maxY - minY;
    final zoomX = spanX < 1e-12 ? maxZoom : math.log(width / (256 * spanX)) / math.ln2;
    final zoomY = spanY < 1e-12 ? maxZoom : math.log(height / (256 * spanY)) / math.ln2;
    // The Web raster map uses integer zooms. Round down so both endpoints fit.
    final zoom = math.min(zoomX, zoomY).clamp(minZoom, maxZoom).floorToDouble();
    final scale = 256 * math.pow(2, zoom);
    final centerX = start + spanX / 2 + (padding.right - padding.left) / (2 * scale);
    final centerY = (minY + maxY) / 2 + (padding.bottom - padding.top) / (2 * scale);
    final mercator = math.pi * (1 - 2 * centerY.clamp(0.0, 1.0));
    final latitude = math.atan((math.exp(mercator) - math.exp(-mercator)) / 2) * 180 / math.pi;
    final longitude = ((centerX * 360) % 360) - 180;
    return RamoMapCameraFit(RamoMapPoint(latitude, longitude), zoom);
  }
}
