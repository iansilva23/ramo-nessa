import 'dart:js_interop';
import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

@JS('navigator.locks.request')
external JSPromise<JSAny?> _requestLock(JSString name, JSFunction callback);

http.Client createSessionHttpClient(String role) => _SessionHttpClient(role);

class _SessionHttpClient extends http.BaseClient {
  _SessionHttpClient(this.role);
  final String role;
  final BrowserClient _inner = BrowserClient();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final mutatesCookie = (request.method == 'POST' &&
        ['/v1/auth/otp/verify', '/v1/auth/passenger/password/login'].contains(request.url.path)) ||
        (request.method == 'DELETE' && request.url.path == '/v1/auth/session');
    if (!mutatesCookie) return _inner.send(request);
    // Serialize cookie mutations across tabs before another login can replace it.
    late http.StreamedResponse response;
    await _requestLock(('ramo.web.auth.' + role).toJS, ((JSAny? _) {
      return _inner.send(request).then<JSAny?>((value) {
        response = value;
        return null;
      }).toJS;
    }).toJS).toDart;
    return response;
  }

  @override
  void close() => _inner.close();
}
