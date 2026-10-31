import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';

/// Stores the chosen camera style and vehicle anchor in the viewport. Mercator
/// offsets rotate with the map rather than dragging the vehicle across it.
class DriverFollowFrame {
  const DriverFollowFrame({required this.zoom, required this.tilt,
    required this.bearingOffset, required this.anchor});
  final double zoom, tilt, bearingOffset;
  final Offset anchor;
  static double _x(double longitude) => (longitude + 180) / 360;
  static double _y(double latitude) => (1 - math.log(math.tan(math.pi / 4 +
      latitude.clamp(-85.05112878, 85.05112878) * math.pi / 360)) / math.pi) / 2;
  static Offset center(Size size, EdgeInsets padding, bool web) => Offset(
    (size.width + (web ? 0 : padding.left - padding.right)) / 2,
    (size.height + (web ? 0 : padding.top - padding.bottom)) / 2);
  static DriverFollowFrame? capture({required gm.CameraPosition camera,
    required LatLng vehicle, required double course, required Size viewport,
    required EdgeInsets padding, required bool web}) {
    if (viewport.isEmpty || !viewport.width.isFinite || !viewport.height.isFinite) return null;
    final scale = 256 * math.pow(2, camera.zoom), angle = camera.bearing * math.pi / 180;
    final dx = ((_x(camera.target.longitude) - _x(vehicle.longitude) + .5) % 1) - .5;
    final dy = _y(camera.target.latitude) - _y(vehicle.latitude);
    final screen = Offset((dx * math.cos(angle) + dy * math.sin(angle)) * scale,
      (-dx * math.sin(angle) + dy * math.cos(angle)) * scale * math.cos(camera.tilt * math.pi / 180).clamp(.1, 1.0));
    final location = center(viewport, padding, web) - screen;
    return DriverFollowFrame(zoom: camera.zoom, tilt: camera.tilt,
      bearingOffset: (camera.bearing - course + 360) % 360,
      anchor: Offset(location.dx / viewport.width, location.dy / viewport.height));
  }
  gm.CameraPosition cameraFor({required LatLng vehicle, required double course,
    required Size viewport, required EdgeInsets padding, required bool web}) {
    final bearing = (course + bearingOffset + 360) % 360;
    final c = center(viewport, padding, web);
    final scale = 256 * math.pow(2, zoom), angle = bearing * math.pi / 180;
    final x = (c.dx - anchor.dx * viewport.width) / scale;
    final y = (c.dy - anchor.dy * viewport.height) /
        (scale * math.cos(tilt * math.pi / 180).clamp(.1, 1.0));
    final worldX = _x(vehicle.longitude) + x * math.cos(angle) - y * math.sin(angle);
    final worldY = _y(vehicle.latitude) + x * math.sin(angle) + y * math.cos(angle);
    final mercator = math.pi * (1 - 2 * worldY.clamp(0.0, 1.0));
    return gm.CameraPosition(target: gm.LatLng(
      math.atan((math.exp(mercator) - math.exp(-mercator)) / 2) * 180 / math.pi,
      ((worldX * 360) % 360) - 180), zoom: zoom, tilt: tilt, bearing: bearing);
  }
}
