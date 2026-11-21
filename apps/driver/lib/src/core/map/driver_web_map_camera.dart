import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

@JS('Proxy')
extension type _ConstructorProxy._(JSObject _) implements JSObject {
  external factory _ConstructorProxy(
    JSFunction target,
    _ConstructorHandler handler,
  );
}

extension type _ConstructorHandler._(JSObject _) implements JSObject {
  external factory _ConstructorHandler({required JSFunction construct});
}

@JS('Reflect.construct')
external JSObject _construct(
  JSFunction target,
  JSArray<JSAny?> arguments,
  JSFunction newTarget,
);

@JS('WeakMap')
extension type _MapsByContainer._(JSObject _) implements JSObject {
  external factory _MapsByContainer();
  external void set(web.Element key, DriverWebMapCamera value);
  external DriverWebMapCamera? get(web.Element key);
}

extension type _CameraOptions._(JSObject _) implements JSObject {
  external factory _CameraOptions({
    required double zoom,
    required double heading,
  });
}

extension type DriverWebMapCamera._(JSObject _) implements JSObject {
  external double? getZoom();
  external double? getHeading();

  @JS('moveCamera')
  external void _moveCamera(_CameraOptions options);

  void apply(double zoom, double heading) =>
      _moveCamera(_CameraOptions(zoom: zoom, heading: heading));
}

final _mapsByContainer = _MapsByContainer();
void Function()? _restoreConstructor;
int _subscriptions = 0;

/// The Flutter plugin owns the Google Map and does not expose its JS camera.
/// Observe new maps without altering the returned instance or its options.
void Function() captureDriverWebMapCamera() {
  if (_subscriptions == 0) {
    final maps = globalContext
        .getProperty<JSObject?>('google'.toJS)
        ?.getProperty<JSObject?>('maps'.toJS);
    final original = maps?.getProperty<JSFunction?>('Map'.toJS);
    if (maps == null || original == null) return () {};
    JSObject construct(
      JSFunction target,
      JSArray<JSAny?> args,
      JSFunction newTarget,
    ) {
      final map = _construct(target, args, newTarget);
      final parameters = args.toDart;
      if (parameters.isNotEmpty && parameters.first.isA<web.Element>()) {
        _mapsByContainer.set(
          parameters.first! as web.Element,
          DriverWebMapCamera._(map),
        );
      }
      return map;
    }

    try {
      final proxy = _ConstructorProxy(
        original,
        _ConstructorHandler(construct: construct.toJS),
      );
      maps.setProperty('Map'.toJS, proxy);
      _restoreConstructor = () {
        if (identical(maps.getProperty<JSObject?>('Map'.toJS), proxy)) {
          maps.setProperty('Map'.toJS, original);
        }
      };
    } catch (_) {
      return () {};
    }
  }
  _subscriptions++;
  return () {
    if (--_subscriptions == 0) {
      _restoreConstructor?.call();
      _restoreConstructor = null;
    }
  };
}

DriverWebMapCamera? driverWebMapCameraFor(web.Element element) {
  web.Element? container = element;
  while (container != null) {
    final camera = _mapsByContainer.get(container);
    if (camera != null) return camera;
    container = container.parentElement;
  }
  return null;
}
