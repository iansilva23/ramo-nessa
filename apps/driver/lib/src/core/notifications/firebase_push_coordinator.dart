import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../config/driver_core_config.dart';
import 'http_push_device_service.dart';

class PushForegroundNotice {
  const PushForegroundNotice({
    required this.title,
    required this.body,
    required this.type,
    required this.data,
  });

  final String title;
  final String body;
  final String type;
  final Map<String, String> data;
}

class FirebasePushCoordinator {
  FirebasePushCoordinator({
    required HttpPushDeviceService registry,
    FirebaseMessaging? messaging,
  })  : _registry = registry,
        _messaging = messaging ?? FirebaseMessaging.instance;

  final HttpPushDeviceService _registry;
  final FirebaseMessaging _messaging;
  final StreamController<PushForegroundNotice> _foregroundController =
      StreamController<PushForegroundNotice>.broadcast();

  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  String? _accessToken;
  bool _initialized = false;

  Stream<PushForegroundNotice> get foregroundNotices =>
      _foregroundController.stream;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    await _messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    _tokenRefreshSubscription =
        _messaging.onTokenRefresh.listen((token) {
      unawaited(_registerToken(token));
    });

    _foregroundSubscription =
        FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      final title = notification?.title?.trim();
      final body = notification?.body?.trim();
      _foregroundController.add(
        PushForegroundNotice(
          title: title == null || title.isEmpty
              ? 'Ramo Nessa'
              : title,
          body: body ?? '',
          type: message.data['type'] ?? 'notification',
          data: Map<String, String>.from(message.data),
        ),
      );
    });
  }

  Future<AuthorizationStatus> authorizationStatus() async {
    final settings = await _messaging.getNotificationSettings();
    return settings.authorizationStatus;
  }

  Future<AuthorizationStatus> requestNotificationPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );
    if (settings.authorizationStatus != AuthorizationStatus.denied) {
      await _registerCurrentToken();
    }
    return settings.authorizationStatus;
  }

  Future<void> bindSession(String accessToken) async {
    final normalized = accessToken.trim();
    if (normalized.length < 20) return;

    _accessToken = normalized;
    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }
      await _registerCurrentToken();
    } catch (_) {
      // Push é best-effort e nunca bloqueia autenticação ou corrida.
    }
  }

  Future<void> unbindSession() async {
    _accessToken = null;
  }

  Future<void> _registerCurrentToken() async {
    final platform = _platformName;
    if (platform == null) return;

    if (defaultTargetPlatform == TargetPlatform.iOS) {
      var apnsReady = false;
      for (var attempt = 0; attempt < 20; attempt++) {
        try {
          final apnsToken = await _messaging.getAPNSToken();
          if (apnsToken != null && apnsToken.isNotEmpty) {
            apnsReady = true;
            break;
          }
        } catch (_) {}
        await Future<void>.delayed(
          const Duration(milliseconds: 250),
        );
      }
      if (!apnsReady) return;
    }

    final token = await _messaging.getToken();
    if (token == null || token.trim().length < 20) return;
    await _registerToken(token);
  }

  Future<void> _registerToken(String token) async {
    final accessToken = _accessToken;
    final platform = _platformName;
    if (
      accessToken == null ||
      accessToken.length < 20 ||
      platform == null
    ) {
      return;
    }

    try {
      await _registry.registerFcmToken(
        accessToken: accessToken,
        platform: platform,
        token: token,
        appVersion: DriverCoreConfig.appVersion,
        buildNumber: DriverCoreConfig.appBuild,
      );
    } catch (_) {
      // Rotação de token será tentada novamente no próximo refresh/bootstrap.
    }
  }

  String? get _platformName {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      default:
        return null;
    }
  }

  Future<void> dispose() async {
    await _tokenRefreshSubscription?.cancel();
    await _foregroundSubscription?.cancel();
    await _foregroundController.close();
  }
}
