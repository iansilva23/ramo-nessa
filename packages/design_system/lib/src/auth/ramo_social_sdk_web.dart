import 'dart:js_interop';

@JS('ramoPrepareFirebaseAuth')
external JSPromise<JSAny?> _prepareFirebaseAuth();

@JS('ramoGoogleUsesRedirect')
external JSBoolean _usesRedirect();
@JS('ramoGoogleRedirectPending')
external JSBoolean _redirectPending();
@JS('ramoSetGoogleRedirectPending')
external void _setRedirectPending(JSBoolean value);

bool ramoGoogleUsesRedirect() => _usesRedirect().toDart;
bool ramoGoogleRedirectPending() {
  try {
    return _redirectPending().toDart;
  } catch (_) {
    return false;
  }
}

void ramoSetGoogleRedirectPending(bool value) =>
    _setRedirectPending(value.toJS);

Future<void> prepareRamoSocialSdk() async {
  try {
    await _prepareFirebaseAuth().toDart.timeout(const Duration(seconds: 12));
  } catch (_) {
    throw const FormatException(
      'Não foi possível carregar o login com Google. Tente novamente.',
    );
  }
}
