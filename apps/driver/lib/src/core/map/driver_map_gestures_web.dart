import 'dart:js_interop';
import 'dart:math' as math;

import 'package:web/web.dart' as web;

/// Platform views can consume events before Flutter's Listener. Capture only
/// Google Map descendants, never the app's cards, buttons or other screens.
void Function() subscribeDriverMapGestures({
  required void Function() down,
  required void Function() move,
  required void Function() up,
  required void Function() wheel,
  bool Function()? beginPinch,
  void Function(double zoomDelta, double bearingDelta)? pinch,
  void Function()? endPinch,
}) {
  final pointers = <int>{};
  final touches = <int, math.Point<double>>{};
  final handlers = <String, JSFunction>{};
  final options = web.AddEventListenerOptions(capture: true, passive: false);
  final document = web.document;
  web.Element? touchMap;
  (int, int)? pair;
  math.Point<double>? start;
  int? frame;

  // Keep browser page gestures from taking ownership of an in-map pinch.
  final style = pinch == null
      ? null
      : (document.createElement('style')
          ..textContent = '.gm-style { touch-action: none; }');
  if (style != null) document.head?.appendChild(style);

  web.Element? mapOf(web.Event event) =>
      (event.target as web.Element?)?.closest('.gm-style');

  void consume(web.Event event) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }

  void writeCamera() {
    final ids = pair;
    final baseline = start;
    if (ids == null || baseline == null) return;
    final a = touches[ids.$1], b = touches[ids.$2];
    if (a == null || b == null) return;
    final vector = b - a;
    if (vector.magnitude < 8) return;
    pinch?.call(
      math.log(vector.magnitude / baseline.magnitude) / math.ln2,
      (math.atan2(baseline.y, baseline.x) - math.atan2(vector.y, vector.x)) *
          180 /
          math.pi,
    );
  }

  void finishPinch() {
    final active = pair != null;
    if (frame case final scheduled?) web.window.cancelAnimationFrame(scheduled);
    frame = null;
    pair = null;
    start = null;
    if (active) endPinch?.call();
  }

  handlers['pointerdown'] = ((web.PointerEvent event) {
    final map = mapOf(event);
    if (map == null || !pointers.add(event.pointerId)) return;
    down();
    if (pinch == null || event.pointerType != 'touch') return;
    touchMap ??= map;
    if (map != touchMap) return;
    touches[event.pointerId] = math.Point(
      event.clientX.toDouble(),
      event.clientY.toDouble(),
    );

    if (pair == null && touches.length == 2) {
      final ids = touches.keys.toList(growable: false);
      final baseline = touches[ids[1]]! - touches[ids[0]]!;
      if (baseline.magnitude >= 8 && beginPinch?.call() == true) {
        pair = (ids[0], ids[1]);
        start = baseline;
      }
    }
    if (pair != null) consume(event);
  }).toJS;

  handlers['pointermove'] = ((web.PointerEvent event) {
    if (!pointers.contains(event.pointerId)) return;
    move();
    if (!touches.containsKey(event.pointerId)) return;
    touches[event.pointerId] = math.Point(
      event.clientX.toDouble(),
      event.clientY.toDouble(),
    );
    if (pair == null) return;
    consume(event);
    frame ??= web.window.requestAnimationFrame(
      ((double _) {
        frame = null;
        writeCamera();
      }).toJS,
    );
  }).toJS;

  void end(web.PointerEvent event) {
    final ids = pair;
    if (ids != null &&
        (event.pointerId == ids.$1 || event.pointerId == ids.$2)) {
      if (frame != null && event.type == 'pointerup') writeCamera();
      if (frame case final scheduled?)
        web.window.cancelAnimationFrame(scheduled);
      frame = null;
    }
    touches.remove(event.pointerId);
    if (touches.isEmpty) {
      finishPinch();
      touchMap = null;
    }
    if (pointers.remove(event.pointerId)) up();
  }

  handlers['pointerup'] = end.toJS;
  handlers['pointercancel'] = end.toJS;
  handlers['wheel'] = ((web.Event event) {
    if (mapOf(event) != null) wheel();
  }).toJS;

  // Maps may use Touch Events too. Only suppress them during our two-finger
  // gesture. Leave end/cancel events available to release the SDK's first touch.
  final interceptTouch = ((web.Event event) {
    if (pair != null && mapOf(event) == touchMap) consume(event);
  }).toJS;
  handlers['touchstart'] = interceptTouch;
  handlers['touchmove'] = interceptTouch;

  void reset() {
    finishPinch();
    touches.clear();
    touchMap = null;
    while (pointers.isNotEmpty) {
      pointers.remove(pointers.first);
      up();
    }
  }

  handlers['visibilitychange'] = ((web.Event _) => reset()).toJS;
  for (final entry in handlers.entries) {
    document.addEventListener(entry.key, entry.value, options);
  }
  return () {
    for (final entry in handlers.entries) {
      document.removeEventListener(entry.key, entry.value, options);
    }
    reset();
    style?.remove();
  };
}
