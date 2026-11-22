import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/availability/driver_screen_lock_events.dart';

void main() {
  test('interprets lock events and ignores duplicates and unknown values', () async {
    final events = DriverScreenLockEvents(
      testEvents: Stream<Object?>.fromIterable([
        'unlocked', 'unlocked', null, 'locked', 'locked', 'unlocked',
      ]),
    );
    expect(await events.states.toList(), [false, true, false]);
  });

  test('other native platforms do not subscribe to Android channel', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    expect(await DriverScreenLockEvents().states.toList(), isEmpty);
  });
}
