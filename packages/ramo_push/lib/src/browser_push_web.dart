import 'dart:js_interop';

@JS('ramoWebPush')
external JSObject? get _bridge;
@JS('ramoWebPush.start')
external JSPromise<JSBoolean> _start(JSObject options);
@JS('ramoWebPush.setPreference')
external JSPromise<JSBoolean> _preference(JSString preference);
@JS('ramoWebPush.stop')
external JSPromise<JSAny?> _stop();
@JS('ramoWebPush.status')
external JSString _status();

Future<bool> startBrowserPush({
  required Uri baseUrl,
  required String accessToken,
  required String preference,
  required bool requestPermission,
}) {
  try {
    if (_bridge == null) return Future.value(false);
    // Chamado diretamente: preservar o gesto de usuário antes de qualquer await.
    return _start({
      'baseUrl': baseUrl.toString(),
      'accessToken': accessToken,
      'preference': preference,
      'requestPermission': requestPermission,
    }.jsify() as JSObject).toDart.then((value) => value.toDart).catchError((_) => false);
  } catch (_) {
    return Future.value(false);
  }
}

Future<bool> setBrowserPushPreference(String preference) async {
  try {
    if (_bridge == null) return false;
    return (await _preference(preference.toJS).toDart).toDart;
  } catch (_) { return false; }
}

Future<void> stopBrowserPush() async {
  try { if (_bridge != null) await _stop().toDart; } catch (_) {}
}

String browserPushStatus() {
  try { return _bridge == null ? 'unconfigured' : _status().toDart; }
  catch (_) { return 'unsupported'; }
}
