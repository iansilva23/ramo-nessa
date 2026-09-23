import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_token_store.dart';

class SecureAuthTokenStore implements AuthTokenStore {
  SecureAuthTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _accessTokenKey = 'ramo_nessa_access_token_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() async {
    final value = await _storage.read(key: _accessTokenKey);
    final normalized = value?.trim();
    if (normalized == null || normalized.length < 20) return null;
    return normalized;
  }

  @override
  Future<void> saveAccessToken(String token) async {
    final normalized = token.trim();
    if (normalized.length < 20) {
      throw ArgumentError.value(token, 'token', 'Bearer token inválido.');
    }
    await _storage.write(key: _accessTokenKey, value: normalized);
  }

  @override
  Future<void> clearAccessToken() =>
      _storage.delete(key: _accessTokenKey);
}
