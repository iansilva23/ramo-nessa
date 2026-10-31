import 'dart:convert';
import 'session_http_client.dart';
import 'browser_session_restore_result.dart';

Future<BrowserSessionRestoreResult> restoreBrowserSession(String role) async {
  final page = Uri.base;
  if (page.scheme != 'https' || !page.hasAuthority) {
    return const BrowserSessionRestoreResult(checked: true);
  }
  final client = createSessionHttpClient(role);
  try {
    final response = await client.get(page.resolve('/v1/auth/web/session'),
      headers: {'x-ramo-web-role': role}).timeout(const Duration(seconds: 10));
    if (response.statusCode == 401 || response.statusCode == 403) {
      return const BrowserSessionRestoreResult(checked: true);
    }
    if (response.statusCode != 200) return const BrowserSessionRestoreResult(checked: false);
    final json = jsonDecode(response.body);
    final handle = json is Map<String, dynamic> ? json['accessToken'] : null;
    if (handle is! String || !RegExp('^ramo_web_${role}_v1_[a-f0-9]{32}\$').hasMatch(handle)) return const BrowserSessionRestoreResult(checked: true);
    return BrowserSessionRestoreResult(checked: true, handle: handle);
  } catch (_) {
    // Network failure must not create an authenticated UI without server proof.
    return const BrowserSessionRestoreResult(checked: false);
  } finally { client.close(); }
}
