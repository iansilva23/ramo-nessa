import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;

/// Keeps a usable camera viewport even while an expanded card fills the map.
EdgeInsets driverCameraPadding(Size viewport, EdgeInsets requested) {
  double factor(double total, double extent) => total <= 0 ? 1 :
      ((extent - math.min(96.0, extent / 2)) / total).clamp(0.0, 1.0).toDouble();
  final x = factor(requested.horizontal, viewport.width);
  final y = factor(requested.vertical, viewport.height);
  return EdgeInsets.fromLTRB(requested.left * x, requested.top * y,
      requested.right * x, requested.bottom * y);
}

/// The Web SDK does not apply persistent padding to its camera center.
/// Rotate the screen inset into Mercator space using the current heading;
/// use the actual fractional zoom, not the integer route-preview fit zoom.
gm.CameraPosition driverWebPaddedCamera(gm.CameraPosition camera, EdgeInsets padding) {
  if (padding == EdgeInsets.zero) return camera;
  final scale = 256 * math.pow(2, camera.zoom);
  final angle = camera.bearing * math.pi / 180;
  final x = (padding.right - padding.left) / (2 * scale);
  final y = (padding.bottom - padding.top) /
      (2 * scale * math.cos(camera.tilt * math.pi / 180).clamp(.3, 1.0));
  final latitude = camera.target.latitude.clamp(-85.05112878, 85.05112878) * math.pi / 180;
  final centerX = (camera.target.longitude + 180) / 360 + x * math.cos(angle) - y * math.sin(angle);
  final centerY = (1 - math.log(math.tan(math.pi / 4 + latitude / 2)) / math.pi) / 2 +
      x * math.sin(angle) + y * math.cos(angle);
  final mercator = math.pi * (1 - 2 * centerY.clamp(0.0, 1.0));
  return gm.CameraPosition(
    target: gm.LatLng(math.atan((math.exp(mercator) - math.exp(-mercator)) / 2) * 180 / math.pi,
        ((centerX * 360) % 360) - 180),
    zoom: camera.zoom, tilt: camera.tilt, bearing: camera.bearing);
}
