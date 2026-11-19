import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_web_heading_config.dart';

void main() {
  test('vector web map ID must be explicitly configured', () {
    expect(DriverWebHeadingConfig.isValidMapId(''), isFalse);
    expect(DriverWebHeadingConfig.isValidMapId('   '), isFalse);
    expect(DriverWebHeadingConfig.isValidMapId('null'), isFalse);
    expect(DriverWebHeadingConfig.isValidMapId('undefined'), isFalse);
    expect(DriverWebHeadingConfig.isValidMapId('invalid id'), isFalse);
    expect(DriverWebHeadingConfig.isValidMapId('valid-vector-id'), isTrue);
    expect(DriverWebHeadingConfig.isValidMapId('DEMO_MAP_ID'), isTrue);
  });

  test('camera stays flat (2D) and uses native navigation zoom', () {
    expect(DriverWebHeadingConfig.tilt, 0);
    expect(DriverWebHeadingConfig.zoom, closeTo(17.2, 0.001));
  });

  test('north-pointing needle counter-rotates with map direction', () {
    expect(DriverWebHeadingConfig.northNeedleDegrees(0), 0);
    expect(DriverWebHeadingConfig.northNeedleDegrees(90), 270);
    expect(DriverWebHeadingConfig.northNeedleDegrees(180), 180);
    expect(DriverWebHeadingConfig.northNeedleDegrees(270), 90);
    expect(DriverWebHeadingConfig.northNeedleDegrees(360), 0);
    expect(DriverWebHeadingConfig.northNeedleDegrees(double.nan), 0);
  });

  test('production default remains off without explicit opt-in', () {
    // In normal test/production configurations the new Web heading option
    // is disabled, preserving the published legacy raster map.
    const enabled = bool.fromEnvironment('RAMO_WEB_2D_HEADING_ENABLED');
    if (!enabled) expect(DriverWebHeadingConfig.hasVectorMap, isFalse);
  });
}
