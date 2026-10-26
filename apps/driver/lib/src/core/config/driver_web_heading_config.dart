import 'package:flutter/foundation.dart' show kIsWeb;

/// Web-only, opt-in compass-follow map. Disabled in every existing build.
/// A VECTOR Google Maps JavaScript Map ID is mandatory for real street
/// rotation; the legacy raster map is deliberately preserved otherwise.
abstract final class DriverWebHeadingConfig {
  static const enabledAtBuild = bool.fromEnvironment(
    'RAMO_WEB_2D_HEADING_ENABLED',
    defaultValue: false,
  );

  static const rawMapId = String.fromEnvironment(
    'RAMO_GOOGLE_MAPS_WEB_VECTOR_MAP_ID',
    defaultValue: '',
  );

  static String get vectorMapId => rawMapId.trim();

  static bool get hasVectorMap =>
      kIsWeb && enabledAtBuild && isValidMapId(vectorMapId);

  static bool isValidMapId(String value) {
    final id = value.trim();
    return id.isNotEmpty &&
        id.toLowerCase() != 'null' &&
        id.toLowerCase() != 'undefined' &&
        !id.contains(RegExp(r'\s'));
  }

  // The accepted-ride pickup view remains 2D. Switching the trip to
  // IN_PROGRESS may animate into perspective only when explicitly built in.
  static const zoom = 17.2;
  static const tilt = 0.0;

  static const cinematicTiltRequested = bool.fromEnvironment(
    'RAMO_WEB_CINEMATIC_TILT_ENABLED',
    defaultValue: false,
  );

  static bool get cinematicTiltEnabled =>
      hasVectorMap && cinematicTiltRequested;

  static double northNeedleDegrees(double mapHeading) {
    if (!mapHeading.isFinite) return 0;
    return (360 - (mapHeading % 360)) % 360;
  }
}
