import 'dart:js_interop';

@JS('RamoOfferTone.create')
external _BrowserOfferTone _create();

extension type _BrowserOfferTone._(JSObject _) implements JSObject {
  external JSPromise<JSAny?> start();
  external void stop();
  external JSPromise<JSAny?> dispose();
}

class OfferTonePlayer {
  _BrowserOfferTone? _player;

  _BrowserOfferTone? _prepare() {
    try { return _create(); } catch (_) { return null; }
  }

  void prepare() { _player ??= _prepare(); }

  Future<void> startLoop() async { await _player?.start().toDart; }
  Future<void> stop() async { _player?.stop(); }
  Future<void> dispose() async { await _player?.dispose().toDart; }
}
