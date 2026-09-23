import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_token_store.dart';

class SecureAuthTokenStore implements AuthTokenStore {
  SecureAuthTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _accessTokenKey = 'ramo_nessa_access_token_v1';
  static const _clientInstanceIdKey = 'ramo_nessa_client_instance_id_v1';

  final FlutterSecureStorage _storage;

  Future<String> getOrCreateClientInstanceId() async {
    final existing = (await _storage.read(key: _clientInstanceIdKey))?.trim();
    if (
      existing != null &&
      existing.length >= 32 &&
      RegExp(r'^[a-f0-9]+

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
).hasMatch(existing)
    ) {
      return existing;
    }

    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    final generated = bytes
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
    await _storage.write(
      key: _clientInstanceIdKey,
      value: generated,
    );
    return generated;
  }

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
