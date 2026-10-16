import 'dart:js_interop';

@JS('ramoWebSetup.snapshot')
external JSPromise<JSObject> _setupSnapshot();
@JS('ramoWebSetup.requestLocation')
external JSPromise<JSString> _setupLocation();
@JS('ramoWebSetup.install')
external JSPromise<JSString> _setupInstall();

Future<Map<String, Object?>> browserSetupSnapshot() async {
  try {
    final value = (await _setupSnapshot().toDart).dartify();
    return Map<String, Object?>.from(value as Map);
  } catch (_) {
    return {'location': 'unsupported', 'notification': 'unsupported'};
  }
}

Future<String> requestBrowserSetupLocation() {
  try {
    return _setupLocation().toDart.then((value) => value.toDart).catchError((_) => 'error');
  } catch (_) {
    return Future.value('unsupported');
  }
}

Future<String> installBrowserSetupApp() {
  try {
    return _setupInstall().toDart.then((value) => value.toDart).catchError((_) => 'manual');
  } catch (_) {
    return Future.value('manual');
  }
}

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
    return _start(
      {
            'baseUrl': baseUrl.toString(),
            'accessToken': accessToken,
            'preference': preference,
            'requestPermission': requestPermission,
          }.jsify()
          as JSObject,
    ).toDart.then((value) => value.toDart).catchError((_) => false);
  } catch (_) {
    return Future.value(false);
  }
}

Future<bool> setBrowserPushPreference(String preference) async {
  try {
    if (_bridge == null) return false;
    return (await _preference(preference.toJS).toDart).toDart;
  } catch (_) {
    return false;
  }
}

Future<void> stopBrowserPush() async {
  try {
    if (_bridge != null) await _stop().toDart;
  } catch (_) {}
}

String browserPushStatus() {
  try {
    return _bridge == null ? 'unconfigured' : _status().toDart;
  } catch (_) {
    return 'unsupported';
  }
}
