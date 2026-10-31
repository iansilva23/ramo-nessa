import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_travel_heading.dart';

final start = DateTime.utc(2026, 10, 27, 12);
DriverPosition fix(int second, {double speed = 12, double course = 90, double accuracy = 2,
  double? speedError = .3, double? courseError = 3, double? latitude, double? longitude}) => DriverPosition(
  latitude: latitude ?? -2.82, longitude: longitude ?? -40.41 + second * .00003,
  observedAt: start.add(Duration(seconds: second)), accuracyMeters: accuracy,
  speedMetersPerSecond: speed / 3.6, speedAccuracyMetersPerSecond: speedError,
  courseDegrees: course, courseAccuracyDegrees: courseError);
void feed(DriverTravelHeading tracker, DriverPosition value) => tracker.update(value, now: value.observedAt!);
void main() {
  test('10/5 km/h hysteresis follows travel, never the phone at rest', () {
    final tracker = DriverTravelHeading();
    feed(tracker, fix(0, speed: 0, course: 180)); expect(tracker.bearing, isNull);
    feed(tracker, fix(1, speed: 8)); expect(tracker.bearing, isNull);
    feed(tracker, fix(2, speed: 10)); expect(tracker.bearing, 90); expect(tracker.rotating, true);
    feed(tracker, fix(3, speed: 7, course: 100)); expect(tracker.bearing, closeTo(98.5, .001));
    feed(tracker, fix(4, speed: 4, course: 270)); final held = tracker.bearing;
    expect(tracker.rotating, false);
    feed(tracker, fix(5, speed: 7, course: 180)); expect(tracker.bearing, held);
    feed(tracker, fix(6, speed: 12, course: 110)); expect(tracker.bearing, greaterThan(held!));
  });
  test('uncertain, stale, repeated and teleport fixes cannot turn the map', () {
    final tracker = DriverTravelHeading(); feed(tracker, fix(0)); final held = tracker.bearing;
    feed(tracker, fix(1, accuracy: 100, course: 180)); expect(tracker.bearing, held);
    tracker.update(fix(2, course: 180), now: start.add(const Duration(seconds: 20))); expect(tracker.bearing, held);
    feed(tracker, fix(21));
    feed(tracker, fix(21, course: 180)); expect(tracker.bearing, held);
    feed(tracker, fix(22, course: 180, latitude: -2.9)); expect(tracker.bearing, held);
  });
  test('north crossing takes the short turn; a single false reverse is ignored', () {
    final tracker = DriverTravelHeading(); feed(tracker, fix(0, course: 350));
    feed(tracker, fix(1, course: 10)); expect(tracker.bearing, closeTo(7, .001));
    final held = tracker.bearing;
    feed(tracker, fix(2, course: 190)); expect(tracker.bearing, held);
    feed(tracker, fix(3, course: 190)); expect(DriverTravelHeading.delta(tracker.bearing!, 190).abs(), lessThan(30));
  });
  test('browser corroborates reported speed with precise motion and never rotates on a genuine zero speed', () {
    final tracker = DriverTravelHeading();
    feed(tracker, fix(0, speedError: null, courseError: null)); expect(tracker.bearing, isNull);
    feed(tracker, fix(1, speedError: null, courseError: null)); expect(tracker.bearing, closeTo(90, .1));
    feed(tracker, fix(2, speedError: null, courseError: null)); expect(tracker.bearing, closeTo(90, .1));
    feed(tracker, fix(3, speed: 0, speedError: null, course: 270, courseError: null));
    expect(tracker.bearing, closeTo(90, .1)); expect(tracker.rotating, false);
    tracker.update(const DriverPosition(latitude: -2.82, longitude: -40.41), now: start);
    expect(tracker.bearing, closeTo(90, .1)); expect(tracker.rotating, false);
  });
  test('absent speed and course need a significant timed position change', () {
    final tracker = DriverTravelHeading();
    for (var second = 0; second <= 2; second++) {
      final value = DriverPosition(latitude: -2.82, longitude: -40.41 + second * .00003,
        observedAt: start.add(Duration(seconds: second)), accuracyMeters: 2);
      feed(tracker, value);
      if (second < 2) expect(tracker.bearing, isNull);
    }
    expect(tracker.bearing, closeTo(90, .1));
  });
  test('high frequency camera samples keep the existing ten-second upload cadence', () {
    final gate = DriverLocationUploadGate(); expect(gate.claim(start), true);
    for (var i = 1; i < 10; i++) { expect(gate.claim(start.add(Duration(seconds: i))), false); }
    expect(gate.claim(start.add(const Duration(seconds: 10))), true);
    gate.recordManualUpdate(start.add(const Duration(seconds: 11)));
    expect(gate.claim(start.add(const Duration(seconds: 20))), false);
    expect(gate.claim(start.add(const Duration(seconds: 21))), true);
  });
}
