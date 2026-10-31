import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/map/driver_map_gestures.dart';
import 'support/map_gesture_fixture.dart';
void main() {
  test('Web DOM capture recognizes map gestures, ignores app UI and unsubscribes', () {
    if (!kIsWeb) return;
    final fixture=MapGestureFixture();var downs=0,moves=0,ups=0,wheels=0;
    final cancel=subscribeDriverMapGestures(down:()=>downs++,move:()=>moves++,up:()=>ups++,wheel:()=>wheels++);
    fixture.pointer('pointerdown',map:false);expect(downs,0);
    fixture.pointer('pointerdown');fixture.pointer('pointermove');fixture.wheel();
    fixture.pointer('pointerup',map:false);expect([downs,moves,ups,wheels],[1,1,1,1]);
    cancel();fixture.pointer('pointerdown');expect(downs,1);fixture.dispose();
  });
}
