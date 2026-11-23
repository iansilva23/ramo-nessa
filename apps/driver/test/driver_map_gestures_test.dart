import 'package:flutter/foundation.dart' show kIsWeb;

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/map/driver_map_gestures.dart';

import 'support/map_gesture_fixture.dart';

void main() {
  test(
    'Web DOM capture recognizes map gestures, ignores app UI and unsubscribes',
    () {
      if (!kIsWeb) return;
      final fixture = MapGestureFixture();
      var downs = 0, moves = 0, ups = 0, wheels = 0;
      final cancel = subscribeDriverMapGestures(
        down: () => downs++,
        move: () => moves++,
        up: () => ups++,
        wheel: () => wheels++,
      );
      fixture.pointer('pointerdown', map: false);
      expect(downs, 0);
      fixture.pointer('pointerdown');
      fixture.pointer('pointermove');
      fixture.wheel();
      fixture.pointer('pointerup', map: false);
      expect([downs, moves, ups, wheels], [1, 1, 1, 1]);
      cancel();
      fixture.pointer('pointerdown');
      expect(downs, 1);
      fixture.dispose();
    },
  );

  test(
    'two touches on the map update zoom and rotation in the same sample',
    () async {
      if (!kIsWeb) return;
      final fixture = MapGestureFixture();
      final samples = <(double, double)>[];
      var started = 0, ended = 0;
      final cancel = subscribeDriverMapGestures(
        down: () {},
        move: () {},
        up: () {},
        wheel: () {},
        beginPinch: () {
          started++;
          return true;
        },
        pinch: (zoom, rotation) => samples.add((zoom, rotation)),
        endPinch: () {
          ended++;
        },
      );
      addTearDown(cancel);
      addTearDown(fixture.dispose);
      fixture.touch('pointerdown', 1);
      fixture.touch('pointerdown', 2, x: 100, map: false);
      fixture.touch('pointerup', 2, map: false);
      expect(started, 0);
      fixture.touch('pointerdown', 2, x: 100);
      fixture.touch('pointermove', 2, y: 200);
      fixture.touch('pointerup', 2, y: 200);
      expect(started, 1);
      expect(samples, hasLength(1));
      expect(samples.single.$1, closeTo(1, 0.001));
      expect(samples.single.$2, closeTo(-90, 0.001));
      fixture.touch('pointerup', 1);
      await Future<void>.delayed(Duration.zero);
      expect(ended, 1);
      expect(samples, hasLength(1));
    },
  );

  test(
    'vector camera immediately receives zoom and heading during movement',
    () async {
      if (!kIsWeb) return;
      final fixture = MapGestureFixture()..installFakeNativeMap();
      addTearDown(fixture.dispose);
      var fallbackUpdates = 0;
      final cancel = subscribeDriverMapGestures(
        down: () {},
        move: () {},
        up: () {},
        wheel: () {},
        beginPinch: () => true,
        pinch: (_, _) {
          fallbackUpdates++;
        },
      );
      addTearDown(cancel);
      fixture.createFakeNativeMap();
      fixture.touch('pointerdown', 1);
      fixture.touch('pointerdown', 2, x: 100);
      fixture.touch('pointermove', 2, y: 200);
      await fixture.nextFrame();
      expect(fixture.fakeCameraUpdates(), [17, 300, 2]);
      fixture.touch('pointermove', 2, y: 400);
      expect(fixture.fakeCameraUpdates(), [17, 300, 2, 18, 300, 2]);
      expect(fallbackUpdates, 0);
      fixture.touch('pointerup', 2);
      fixture.touch('pointerup', 1);
      expect(fixture.fakeCameraUpdates(), [17, 300, 2, 18, 300, 2]);
    },
  );

  test(
    'vertical two-finger movement stays with the native tilt gesture',
    () async {
      if (!kIsWeb) return;
      final fixture = MapGestureFixture()..installFakeNativeMap();
      addTearDown(fixture.dispose);
      final cancel = subscribeDriverMapGestures(
        down: () {},
        move: () {},
        up: () {},
        wheel: () {},
        beginPinch: () => true,
        pinch: (_, _) =>
            fail('Native tilt should not drive the combined gesture'),
      );
      addTearDown(cancel);
      fixture.createFakeNativeMap();
      expect(fixture.touch('pointerdown', 1), isTrue);
      expect(fixture.touch('pointerdown', 2, x: 100), isTrue);
      fixture.touch('pointermove', 1, y: 20);
      fixture.touch('pointermove', 2, x: 100, y: 21);
      await fixture.nextFrame();
      expect(fixture.touch('pointermove', 1, y: 40), isTrue);
      expect(fixture.touch('pointermove', 2, x: 100, y: 41), isTrue);
      expect(fixture.fakeCameraUpdates(), isEmpty);
      fixture.touch('pointerup', 2);
      fixture.touch('pointerup', 1);
    },
  );
}
