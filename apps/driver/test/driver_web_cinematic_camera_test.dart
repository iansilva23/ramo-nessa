import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_web_cinematic_camera.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_web_heading_config.dart';

void main() {
  test('cinematic GPS requires explicit vector-map and build opt-in', () {
    expect(
      DriverWebHeadingConfig.cinematicTiltEnabled,
      DriverWebHeadingConfig.hasVectorMap &&
          DriverWebHeadingConfig.cinematicTiltRequested,
    );
  });

  test('entrance is smooth, monotonic and reaches the driving perspective', () {
    final start = DriverWebHeadingConfig.zoom;
    var lastZoom = start;
    var lastTilt = 0.0;
    for (var frame = 0; frame <= DriverWebCinematicCamera.animationSteps; frame++) {
      final t = frame / DriverWebCinematicCamera.animationSteps;
      final zoom = DriverWebCinematicCamera.interpolate(
        start, DriverWebCinematicCamera.drivingZoom, t);
      final tilt = DriverWebCinematicCamera.interpolate(
        0, DriverWebCinematicCamera.drivingTilt, t);
      expect(zoom, greaterThanOrEqualTo(lastZoom - 0.0001));
      expect(tilt, greaterThanOrEqualTo(lastTilt - 0.0001));
      expect(tilt, inInclusiveRange(0.0, 60.0));
      lastZoom = zoom;
      lastTilt = tilt;
    }
    expect(lastZoom, DriverWebCinematicCamera.drivingZoom);
    expect(lastTilt, DriverWebCinematicCamera.drivingTilt);
    expect(DriverWebCinematicCamera.ease(0), 0);
    expect(DriverWebCinematicCamera.ease(1), 1);
    expect(DriverWebCinematicCamera.ease(.5), closeTo(.5, .00001));
  });

  test('camera aims ahead of vehicle without altering driver GPS', () {
    const driver = LatLng(-2.7956, -40.5142);
    final north = DriverWebCinematicCamera.lookAhead(driver, 0, 26);
    final east = DriverWebCinematicCamera.lookAhead(driver, 90, 26);
    expect(north.latitude, greaterThan(driver.latitude));
    expect(north.longitude, closeTo(driver.longitude, 0.000001));
    expect(east.longitude, greaterThan(driver.longitude));
    expect(east.latitude, closeTo(driver.latitude, 0.000001));
    expect(driver.latitude, -2.7956);
    expect(driver.longitude, -40.5142);
    expect(DriverWebCinematicCamera.lookAhead(driver, 0, 0), driver);
  });

  test('shortest bearing path and 2D return work across north', () {
    expect(DriverWebCinematicCamera.interpolateBearing(350, 10, 0.5),
        closeTo(0, 0.0001));
    expect(DriverWebCinematicCamera.interpolateBearing(10, 350, 0.5),
        closeTo(0, 0.0001));
    expect(DriverWebCinematicCamera.interpolate(55, 0, 1), 0);
    expect(DriverWebCinematicCamera.interpolate(18, 16, 1), 16);
  });
}
