import 'dart:convert';
import 'session_http_client.dart';

Future<String?> restoreBrowserSession(String role) async {
  final page = Uri.base;
  if (page.scheme != 'https' || !page.hasAuthority) return null;
  final client = createSessionHttpClient(role);
  try {
    final response = await client.get(page.resolve('/v1/auth/web/session'),
      headers: {'x-ramo-web-role': role}).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) return null;
    final json = jsonDecode(response.body);
    final handle = json is Map<String, dynamic> ? json['accessToken'] : null;
    if (handle is! String || !RegExp('^ramo_web_${role}_v1_[a-f0-9]{32}\$').hasMatch(handle)) return null;
    return handle;
  } catch (_) {
    // Network failure must not create an authenticated UI without server proof.
    return null;
  } finally { client.close(); }
}
