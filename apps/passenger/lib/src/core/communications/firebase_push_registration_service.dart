import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/ramo_core_config.dart';
import 'firebase_push_config.dart';

class FirebasePushRegistrationService {
  FirebasePushRegistrationService._();

  static final FirebasePushRegistrationService instance =
      FirebasePushRegistrationService._();

  StreamSubscription<String>? _refreshSubscription;
  Uri? _baseUrl;
  String? _accessToken;

  String? get _platform {
    if (kIsWeb) return null;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => null,
    };
  }

  Future<void> start({
    required Uri baseUrl,
    required String accessToken,
  }) async {
    await _refreshSubscription?.cancel();
    _refreshSubscription = null;

    final normalizedToken = accessToken.trim();
    _baseUrl = baseUrl;
    _accessToken = normalizedToken;

    final platform = _platform;
    final options = RamoFirebasePushConfig.options;
    if (
      platform == null ||
      options == null ||
      normalizedToken.length < 20
    ) {
      return;
    }

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: options);
      }

      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }

      if (platform == 'ios') {
        await messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      final token = await messaging.getToken();
      if (token != null && token.trim().length >= 20) {
        await _register(token.trim(), platform);
      }

      _refreshSubscription = messaging.onTokenRefresh.listen(
        (refreshedToken) {
          final activeToken = _accessToken;
          final activeBaseUrl = _baseUrl;
          if (
            activeToken == null ||
            activeToken.length < 20 ||
            activeBaseUrl == null ||
            refreshedToken.trim().length < 20
          ) {
            return;
          }
          unawaited(_register(refreshedToken.trim(), platform));
        },
        onError: (_) {
          // Push é best-effort e nunca deve bloquear o app.
        },
      );
    } catch (_) {
      // Firebase/configuração/rede nunca deve impedir login ou corridas.
    }
  }

  Future<void> stop() async {
    await _refreshSubscription?.cancel();
    _refreshSubscription = null;
    _baseUrl = null;
    _accessToken = null;
  }

  Future<void> _register(String token, String platform) async {
    final baseUrl = _baseUrl;
    final accessToken = _accessToken;
    if (
      baseUrl == null ||
      accessToken == null ||
      accessToken.length < 20
    ) {
      return;
    }

    try {
      final response = await http
          .put(
            baseUrl.resolve('/v1/notifications/device'),
            headers: {
              'authorization': 'Bearer $accessToken',
              'content-type': 'application/json',
            },
            body: jsonEncode({
              'platform': platform,
              'provider': 'fcm',
              'token': token,
              'appVersion': RamoCoreConfig.appVersion,
              'buildNumber': RamoCoreConfig.appBuild,
            }),
          )
          .timeout(RamoCoreConfig.requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError(
          'Core recusou cadastro push (${response.statusCode}).',
        );
      }
    } catch (_) {
      // O token será tentado novamente no próximo login/refresh.
    }
  }
}
