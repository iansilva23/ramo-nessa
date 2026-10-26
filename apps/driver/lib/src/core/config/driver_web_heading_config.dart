import 'package:flutter/foundation.dart' show kIsWeb;

/// Web compass-follow configuration restored from the official GPS Cinema build.
/// A VECTOR Google Maps JavaScript Map ID is mandatory for real street
/// rotation. This public ID is the same one used by the official 25/10 build.
/// Explicit build overrides can still disable the feature or select another ID.
abstract final class DriverWebHeadingConfig {
  static const enabledAtBuild = bool.fromEnvironment(
    'RAMO_WEB_2D_HEADING_ENABLED',
    defaultValue: true,
  );

  static const rawMapId = String.fromEnvironment(
    'RAMO_GOOGLE_MAPS_WEB_VECTOR_MAP_ID',
    defaultValue: 'de20bf289d6db3ad15fdb14b',
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
    defaultValue: true,
  );

  static bool get cinematicTiltEnabled =>
      hasVectorMap && cinematicTiltRequested;

  static double northNeedleDegrees(double mapHeading) {
    if (!mapHeading.isFinite) return 0;
    return (360 - (mapHeading % 360)) % 360;
  }
}
