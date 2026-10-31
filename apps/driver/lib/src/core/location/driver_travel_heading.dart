import 'dart:math' as math;
import 'package:latlong2/latlong.dart';
import '../config/driver_map_config.dart';
import 'driver_location_service.dart';

/// Course over ground, never phone orientation. Missing or uncertain telemetry
/// freezes the last trustworthy bearing. Speed hysteresis prevents stop/start
/// chatter at traffic lights and while handling the phone.
class DriverTravelHeading {
  double? bearing;
  bool rotating = false;
  DriverPosition? _last, _anchor;
  double? _reverseCandidate;

  static double delta(double from, double to) => (to - from + 540) % 360 - 180;
  static LatLng point(DriverPosition p) => LatLng(p.latitude, p.longitude);
  void update(DriverPosition fix, {required DateTime now}) {
    final time = fix.observedAt, accuracy = fix.accuracyMeters;
    if (time == null || accuracy == null || !accuracy.isFinite || accuracy <= 0 || accuracy > 30 ||
        !fix.latitude.isFinite || !fix.longitude.isFinite || fix.latitude.abs() > 90 || fix.longitude.abs() > 180 ||
        now.difference(time).inMilliseconds > 10000 || time.difference(now).inMilliseconds > 1000) {
      rotating = false; _last = null; _anchor = null; _reverseCandidate = null; return;
    }
    final previous = _last;
    if (previous != null && !time.isAfter(previous.observedAt!)) return;
    _last = fix;
    double? stepSeconds, stepDistance, stepBearing;
    if (previous != null) {
      final seconds = time.difference(previous.observedAt!).inMilliseconds / 1000;
      stepSeconds = seconds; stepDistance = DriverMapConfig.distanceMeters(point(previous), point(fix));
      if (stepDistance > 0) stepBearing = DriverMapConfig.bearingDegrees(point(previous), point(fix));
      final speed = math.max(fix.speedMetersPerSecond ?? 0, previous.speedMetersPerSecond ?? 0);
      final limit = math.max(20.0, (speed.clamp(0, 70) + 8) * seconds + accuracy + previous.accuracyMeters!);
      if (seconds > 15 || DriverMapConfig.distanceMeters(point(previous), point(fix)) > limit) {
        rotating = false; _anchor = fix; _reverseCandidate = null; return;
      }
    }
    _anchor ??= fix;
    final anchor = _anchor!;
    final elapsed = time.difference(anchor.observedAt!).inMilliseconds / 1000;
    final distance = DriverMapConfig.distanceMeters(point(anchor), point(fix));
    final displacementKnown = elapsed >= .5 && elapsed <= 15 &&
        distance >= math.max(6.0, accuracy + anchor.accuracyMeters!);
    final raw = fix.speedMetersPerSecond, error = fix.speedAccuracyMetersPerSecond;
    final rawValue = raw ?? 0;
    final rawSpeedAvailable = raw != null && rawValue.isFinite && rawValue >= 0 && rawValue <= 70;
    if (rawSpeedAvailable && rawValue * 3.6 <= 5) {
      rotating = false; _anchor = fix; _reverseCandidate = null; return;
    }
    final speedKnown = rawSpeedAvailable && error != null && error.isFinite && error >= 0 && error <= 2;
    // Browsers do not provide per-field speed/course errors. A positive
    // reported speed needs corroborating, precise, timed displacement.
    final corroborated = rawSpeedAvailable && error == null && previous != null &&
        stepSeconds != null && stepSeconds >= .5 && stepSeconds <= 5 &&
        stepDistance != null && accuracy <= 5 && previous.accuracyMeters! <= 5 &&
        stepDistance >= math.max(3.0, accuracy) &&
        (stepDistance / stepSeconds - rawValue).abs() <= math.max(3.0, accuracy / stepSeconds);
    final speed = speedKnown || corroborated ? rawValue : (displacementKnown ? distance / elapsed : null);
    if (speed != null) {
      if (speed * 3.6 <= 5) rotating = false;
      if (speed * 3.6 >= 10) rotating = true;
    }
    if (elapsed > 15) _anchor = fix;
    if (!rotating || speed == null) { _reverseCandidate = null; return; }
    final course = fix.courseDegrees, courseError = fix.courseAccuracyDegrees;
    final nativeCourseKnown = speedKnown && course != null && course.isFinite && course >= 0 && course < 360 &&
        courseError != null && courseError.isFinite && courseError > 0 && courseError <= 25;
    final browserCourseKnown = corroborated && course != null && course.isFinite && course >= 0 && course < 360 &&
        courseError == null && stepBearing != null && delta(stepBearing, course).abs() <= 25;
    final candidate = nativeCourseKnown || browserCourseKnown ? course : (corroborated ? stepBearing :
        (displacementKnown ? DriverMapConfig.bearingDegrees(point(anchor), point(fix)) : null));
    if (displacementKnown) _anchor = fix;
    if (candidate == null) return;
    final old = bearing;
    if (old == null) { bearing = candidate; return; }
    final change = delta(old, candidate);
    if (change.abs() > 135 && (_reverseCandidate == null || delta(_reverseCandidate!, candidate).abs() > 25)) {
      _reverseCandidate = candidate; return;
    }
    _reverseCandidate = null;
    if (change.abs() > 1.5) bearing = (old + change * .85 + 360) % 360;
  }
}

/// Local camera fixes do not turn into an HTTP request for each GPS sample.
class DriverLocationUploadGate {
  DateTime? _last;
  bool claim(DateTime now) {
    if (_last != null && now.difference(_last!) < const Duration(seconds: 10)) return false;
    _last = now; return true;
  }
  void recordManualUpdate(DateTime now) { _last = now; }
}
