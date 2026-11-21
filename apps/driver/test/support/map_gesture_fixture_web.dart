import 'dart:async';
import 'dart:js_interop';

@JS('requestAnimationFrame')
external int _requestAnimationFrame(JSFunction callback);

@JS('eval')
external JSAny? _evaluate(String source);
@JS('document')
external _Document get _document;

extension type _Document(JSObject _) implements JSObject {
  external _Element createElement(String tag);
  external _Element get body;
}

extension type _Element(JSObject _) implements JSObject {
  external set className(String value);
  external void appendChild(_Element child);
  external void remove();
  external bool dispatchEvent(JSObject event);
}

@JS('PointerEvent')
extension type _PointerEvent._(JSObject _) implements JSObject {
  external factory _PointerEvent(String type, JSObject options);
}

@JS('WheelEvent')
extension type _WheelEvent._(JSObject _) implements JSObject {
  external factory _WheelEvent(String type, JSObject options);
}

extension type _Options._(JSObject _) implements JSObject {
  external factory _Options({
    int? pointerId,
    bool? bubbles,
    bool? cancelable,
    String? pointerType,
    num? clientX,
    num? clientY,
  });
}

class MapGestureFixture {
  final _map = _document.createElement('div'),
      _other = _document.createElement('button');
  MapGestureFixture() {
    _map.className = 'gm-style';
    _document.body.appendChild(_map);
    _document.body.appendChild(_other);
  }
  void pointer(String type, {bool map = true}) =>
      (map ? _map : _other).dispatchEvent(
        _PointerEvent(type, _Options(pointerId: 1, bubbles: true)),
      );
  bool touch(
    String type,
    int pointer, {
    num x = 0,
    num y = 0,
    bool map = true,
  }) => (map ? _map : _other).dispatchEvent(
    _PointerEvent(
      type,
      _Options(
        pointerId: pointer,
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      ),
    ),
  );
  Future<void> nextFrame() {
    final done = Completer<void>();
    _requestAnimationFrame(((double _) => done.complete()).toJS);
    return done.future;
  }

  void installFakeNativeMap() {
    _evaluate('''
      globalThis.ramoPreviousGoogle = globalThis.google;
      globalThis.ramoFakeCamera = [];
      globalThis.google = {maps: {Map: class Map {
        constructor(element) { this.element = element; }
        getZoom() { return 16; }
        getHeading() { return 30; }
        moveCamera(options) {
          ramoFakeCamera.push(options.zoom, options.heading, Object.keys(options).length);
        }
      }}};
    ''');
  }

  void createFakeNativeMap() {
    _evaluate("new google.maps.Map(document.querySelector('.gm-style'))");
  }

  List<double> fakeCameraUpdates() =>
      (_evaluate('ramoFakeCamera') as JSArray<JSNumber>).toDart
          .map((value) => value.toDartDouble)
          .toList();
  void wheel() =>
      _map.dispatchEvent(_WheelEvent('wheel', _Options(bubbles: true)));
  void dispose() {
    _map.remove();
    _other.remove();
    _evaluate('''
      if ('ramoPreviousGoogle' in globalThis) {
        globalThis.google = globalThis.ramoPreviousGoogle;
        delete globalThis.ramoPreviousGoogle;
        delete globalThis.ramoFakeCamera;
      }
    ''');
  }
}
