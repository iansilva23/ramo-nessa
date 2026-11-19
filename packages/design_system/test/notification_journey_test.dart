import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  final now = DateTime(2026, 11, 2, 14);
  const route = [(latitude: -2.82, longitude: -40.42), (latitude: -2.82, longitude: -40.40)];
  test('uses the loaded polyline and current GPS without advancing by clock', () {
    final journey = RamoNotificationJourney();
    final a = journey.sample(key: 'trip/dropoff', points: route, latitude: -2.82, longitude: -40.41,
        positionAt: now, now: now, duration: const Duration(minutes: 20));
    expect(a?.progress, closeTo(.5, .01));
    expect(a?.eta, contains('14:10'));
    final b = journey.sample(key: 'trip/dropoff', points: const [], latitude: -2.82, longitude: -40.41,
        positionAt: now.add(const Duration(minutes: 2)), now: now.add(const Duration(minutes: 2)));
    expect(b?.progress, a?.progress);
  });
  test('stale, invalid and far off-route GPS does not invent progress or ETA', () {
    for (final point in [(latitude: -2.90, longitude: -40.41), (latitude: double.nan, longitude: -40.41)]) {
      expect(RamoNotificationJourney().sample(key: 'trip', points: route, latitude: point.latitude,
          longitude: point.longitude, positionAt: now, now: now), isNull);
    }
    expect(RamoNotificationJourney().sample(key: 'trip', points: route, latitude: -2.82, longitude: -40.41,
        positionAt: now.subtract(const Duration(minutes: 1)), now: now), isNull);
  });
  test('ride and pickup/dropoff changes cannot reuse previous route', () {
    final journey = RamoNotificationJourney();
    expect(journey.sample(key: 'trip/pickup', points: route, latitude: -2.82, longitude: -40.41,
        positionAt: now, now: now), isNotNull);
    expect(journey.sample(key: 'trip/dropoff', points: const [], latitude: -2.82, longitude: -40.41,
        positionAt: now, now: now), isNull);
  });
  test('repeated route refreshes retain progress from the start of the phase', () {
    final journey = RamoNotificationJourney();
    journey.sample(key: 'trip', points: route, latitude: -2.82, longitude: -40.42, positionAt: now, now: now);
    final result = journey.sample(key: 'trip', points: const [(latitude: -2.82, longitude: -40.41), (latitude: -2.82, longitude: -40.40)],
        latitude: -2.82, longitude: -40.41, positionAt: now, now: now);
    expect(result?.progress, closeTo(.5, .01));
  });
}
