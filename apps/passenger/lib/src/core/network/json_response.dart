import 'dart:convert';

Map<String, dynamic>? decodeJsonObject(String body) {
  if (body.trim().isEmpty) return null;

  try {
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic> ? decoded : null;
  } catch (_) {
    return null;
  }
}

String apiErrorMessage(
  Map<String, dynamic>? body,
  String fallback,
) {
  final message = body?['message'];
  if (message is String && message.trim().isNotEmpty) {
    return message.trim();
  }
  return fallback;
}
