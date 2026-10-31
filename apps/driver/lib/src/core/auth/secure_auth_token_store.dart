import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_token_store.dart';
import 'browser_session_restore.dart';

class SecureAuthTokenStore implements AuthTokenStore {
  SecureAuthTokenStore({FlutterSecureStorage? storage, bool? browserSession})
    : _storage = storage ?? const FlutterSecureStorage(),
      _browserSession = browserSession ?? kIsWeb;

  // PWAs share one origin; each app must retain its own login.
  String get _accessTokenKey => _browserSession
      ? 'ramo_nessa_driver_access_token_v1'
      : 'ramo_nessa_access_token_v1';
  // PWAs share one origin; each app must retain its own login.
  String get _clientInstanceIdKey => _browserSession
      ? 'ramo_nessa_driver_client_instance_id_v1'
      : 'ramo_nessa_client_instance_id_v1';

  final FlutterSecureStorage _storage;
  final bool _browserSession;
  bool _isWebHandle(String value) => RegExp(r'^ramo_web_driver_v1_[a-f0-9]{32}$').hasMatch(value);

  Future<String> getOrCreateClientInstanceId() async {
    final existing = (await _storage.read(key: _clientInstanceIdKey))?.trim();
    if (existing != null &&
        existing.length >= 32 &&
        RegExp(r'^[a-f0-9]+$').hasMatch(existing)) {
      return existing;
    }

    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    final generated = bytes
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
    await _storage.write(key: _clientInstanceIdKey, value: generated);
    return generated;
  }

  @override
  Future<String?> readAccessToken() async {
    if (_browserSession) {
      await _purgeLegacyWebCredentials();
      String? cached;
      try { cached = (await _storage.read(key: _accessTokenKey))?.trim(); } catch (_) {}
      final restored = await restoreBrowserSession('driver');
      if (restored.checked) {
        final handle = restored.handle;
        try {
          if (handle == null) { await _storage.delete(key: _accessTokenKey); }
          else { await _storage.write(key: _accessTokenKey, value: handle); }
        } catch (_) {}
        return handle;
      }
      // Temporary network failure can preserve a previously validated public handle.
      return cached != null && _isWebHandle(cached) ? cached : null;
    }
    final value = (await _storage.read(key: _accessTokenKey))?.trim();
    if (value == null || !RegExp(r'^[A-Za-z0-9_-]{20,4096}$').hasMatch(value)) return null;
    return value;
  }

  Future<void> _purgeLegacyWebCredentials() async {
    try { await _storage.delete(key: 'ramo_nessa_access_token_v1'); } catch (_) {}
    for (final role in ['passenger', 'driver']) {
      final key = 'ramo_nessa_${role}_access_token_v1';
      try {
        final value = await _storage.read(key: key);
        if (value != null && !RegExp('^ramo_web_${role}_v1_[a-f0-9]{32}\$').hasMatch(value.trim())) {
          await _storage.delete(key: key);
        }
      } catch (_) {
        // An unreadable legacy entry must not leave a private credential behind.
        try { await _storage.delete(key: key); } catch (_) {}
      }
    }
  }

  @override
  Future<void> saveAccessToken(String token) async {
    final normalized = token.trim();
    if ((_browserSession && !_isWebHandle(normalized)) ||
        !RegExp(r'^[A-Za-z0-9_-]{20,4096}$').hasMatch(normalized)) {
      throw ArgumentError('Bearer token inválido.');
    }
    if (_browserSession) {
      try { await _storage.write(key: _accessTokenKey, value: normalized); } catch (_) {}
    } else {
      await _storage.write(key: _accessTokenKey, value: normalized);
    }
  }

  @override
  Future<void> clearAccessToken() => _storage.delete(key: _accessTokenKey);
}
