import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_map_config.dart';

void main() {
  const center = LatLng(-2.7956, -40.5142);
  const east10m = LatLng(-2.7956, -40.5141);
  const east2m = LatLng(-2.7956, -40.51418);
  const tooFar = LatLng(-2.7956, -40.505);

  test('3D camera settings remain in safe native Google Maps ranges', () {
    expect(DriverMapConfig.navigationTilt, inInclusiveRange(0, 60));
    expect(DriverMapConfig.navigationZoom, inInclusiveRange(16, 19));
    expect(DriverMapConfig.headingMinTravelMeters, greaterThan(5));
  });

  test('a driver moving east gets an eastward bearing, not north', () {
    final heading = DriverMapConfig.courseFromMovement(center, east10m);
    expect(heading, isNotNull);
    expect(heading!, closeTo(90, 2));
  });

  test('stationary jitter cannot rotate the camera', () {
    expect(DriverMapConfig.courseFromMovement(center, center), isNull);
    expect(DriverMapConfig.courseFromMovement(center, east2m), isNull);
  });

  test('implausible GPS teleports do not rewrite course', () {
    expect(DriverMapConfig.courseFromMovement(center, tooFar), isNull);
    expect(
      DriverMapConfig.courseFromMovement(
        const LatLng(double.nan, -40.5),
        center,
      ),
      isNull,
    );
  });

  test('map starts facing the nearby route if GPS direction is unknown', () {
    final heading = DriverMapConfig.routeBearing(center, [
      const LatLng(-2.7956, -40.5143),
      const LatLng(-2.7956, -40.5141),
    ]);
    expect(heading, isNotNull);
    expect(heading!, closeTo(90, 2));
  });

  test('an unrelated distant route is not used to orient the camera', () {
    expect(
      DriverMapConfig.routeBearing(center, [
        const LatLng(-2.788, -40.5),
        const LatLng(-2.788, -40.49),
      ]),
      isNull,
    );
    expect(DriverMapConfig.routeBearing(center, [center]), isNull);
  });

  test('heading interpolation takes the short way across north', () {
    final heading = DriverMapConfig.smoothBearing(350, 10);
    expect(heading, inInclusiveRange(350, 360));
    expect(DriverMapConfig.smoothBearing(10, 350), inInclusiveRange(0, 10));
  });

  test('normal map policy is unchanged for rides and ordinary GPS', () {
    expect(
      DriverMapConfig.shouldAutoFollow(
        hasActiveRide: true,
        navigationMode: false,
      ),
      isFalse,
    );
    expect(
      DriverMapConfig.shouldAutoFollow(
        hasActiveRide: true,
        navigationMode: true,
      ),
      isTrue,
    );
  });
}
