import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// Deterministic camera geometry. No native/JS SDK dependency, so every
/// interpolation step can be tested on the same build as the driver app.
abstract final class DriverWebCinematicCamera {
  static const animationSteps = 16;
  static const frameInterval = Duration(milliseconds: 105);
  static const drivingZoom = 18.0;
  static const drivingTilt = 55.0;
  static const lookAheadMeters = 26.0;

  static double ease(double progress) {
    final t = progress.clamp(0.0, 1.0).toDouble();
    return t * t * (3 - 2 * t);
  }

  static double interpolate(double from, double to, double progress) =>
      from + (to - from) * ease(progress);

  static double interpolateBearing(
    double from,
    double to,
    double progress,
  ) {
    final turn = ((to - from + 540) % 360) - 180;
    return (from + turn * ease(progress) + 360) % 360;
  }

  /// Moves the camera's target just ahead of the vehicle, leaving it lower
  /// in the viewport and showing the road in front instead of behind it.
  /// Does not modify the actual driver position or polyline.
  static LatLng lookAhead(LatLng driver, double heading, double meters) {
    if (!heading.isFinite || !meters.isFinite || meters <= 0) return driver;
    final radians = heading * math.pi / 180;
    final lat = driver.latitude + math.cos(radians) * meters / 111320;
    final cosine = math.cos(driver.latitude * math.pi / 180);
    if (cosine.abs() < 0.01) return LatLng(lat, driver.longitude);
    final lng =
        driver.longitude + math.sin(radians) * meters / (111320 * cosine);
    return LatLng(lat, lng);
  }
}
