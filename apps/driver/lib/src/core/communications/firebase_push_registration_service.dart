import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ramo_push/ramo_push.dart';
import 'package:http/http.dart' as http;

import '../config/driver_core_config.dart';
import 'firebase_push_config.dart';

class DriverFirebasePushRegistrationService {
  DriverFirebasePushRegistrationService._();

  static final DriverFirebasePushRegistrationService instance =
      DriverFirebasePushRegistrationService._();

  StreamSubscription<String>? _refreshSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription, _foregroundSubscription;
  Uri? _baseUrl;
  String? _accessToken;
  String? _pushToken;
  bool _allNotifications = false;
  bool _registered = false;
  int _generation = 0;
  static const _preferenceKey = 'ramo_nessa_notifications_driver_v1';

  Future<bool> readAllNotifications() async {
    try {
      _allNotifications =
          await const FlutterSecureStorage().read(key: _preferenceKey) == 'all';
    } catch (_) {
      _allNotifications = false;
    }
    return _allNotifications;
  }

  Future<bool> setAllNotifications(bool all) async {
    _allNotifications = all;
    await const FlutterSecureStorage().write(
      key: _preferenceKey,
      value: all ? 'all' : 'important',
    );
    if (kIsWeb) return setBrowserPushPreference(all ? 'all' : 'important');
    final platform = _platform;
    final token = _pushToken;
    if (platform == null || token == null) return false;
    return _register(token, platform, _generation);
  }

  String notificationHelp() {
    if (!kIsWeb) {
      return _registered
          ? 'Notificações ativadas neste aparelho.'
          : 'Ative para receber avisos de corridas e pagamentos. Se negou a permissão, ajuste as notificações nas configurações do aparelho.';
    }
    return switch (browserPushStatus()) {
      'ready' => 'Notificações ativadas nesta PWA.',
      'install' =>
        'No iPhone/iPad com iOS 16.4 ou posterior, adicione à Tela de Início e abra pelo ícone para ativar notificações.',
      'denied' =>
        'Permissão negada. No iPhone, abra Ajustes → Notificações → Ramo Nessa. Em outros navegadores, ajuste as permissões deste site.',
      'unconfigured' || 'configuration-conflict' =>
        'Notificações Web ainda não foram configuradas neste ambiente. Os avisos continuam disponíveis no aplicativo aberto.',
      'granted' =>
        'Permissão concedida. Toque em Ativar para confirmar o cadastro dos avisos.',
      'prompt' =>
        'Ative para receber avisos de corridas e pagamentos. No iPhone, abra pela Tela de Início.',
      _ =>
        'Notificações indisponíveis neste navegador. Use HTTPS e um navegador compatível; no iPhone, abra pela Tela de Início.',
    };
  }

  Future<bool> requestNotifications() {
    final baseUrl = _baseUrl;
    final token = _accessToken;
    if (baseUrl == null || token == null) return Future.value(false);
    return start(baseUrl: baseUrl, accessToken: token, requestPermission: true);
  }

  String? get _platform {
    if (kIsWeb) return null;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => null,
    };
  }

  Future<void> restore({required Uri baseUrl, required String accessToken}) async {
    final generation = ++_generation;
    await readAllNotifications();
    if (generation != _generation) return;
    await start(baseUrl: baseUrl, accessToken: accessToken);
  }

  Future<bool> start({
    required Uri baseUrl,
    required String accessToken,
    bool requestPermission = false,
  }) async {
    final generation = ++_generation;
    if (kIsWeb) {
      _baseUrl = baseUrl;
      _accessToken = accessToken.trim();
      return startBrowserPush(
        baseUrl: baseUrl,
        accessToken: accessToken,
        preference: _allNotifications ? 'all' : 'important',
        requestPermission: requestPermission,
      );
    }
    _registered = false;
    final previousSubscription = _refreshSubscription;
    _refreshSubscription = null;
    await previousSubscription?.cancel();
    if (generation != _generation) return false;

    final normalizedToken = accessToken.trim();
    _baseUrl = baseUrl;
    _accessToken = normalizedToken;

    final platform = _platform;
    final options = DriverFirebasePushConfig.options;
    if (platform == null || options == null || normalizedToken.length < 20) {
      return false;
    }

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: options);
      }

      final messaging = FirebaseMessaging.instance;
      // Não exibir prompt do sistema antes da página de permissões.
      final settings = requestPermission
          ? await messaging.requestPermission(
              alert: true,
              badge: true,
              sound: true,
              provisional: false,
            )
          : await messaging.getNotificationSettings();
      if (settings.authorizationStatus != AuthorizationStatus.authorized &&
          settings.authorizationStatus != AuthorizationStatus.provisional) {
        return false;
      }

      if (platform == 'ios') {
        await messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      await _openedSubscription?.cancel();
      await _foregroundSubscription?.cancel();
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((message) {
        if (generation == _generation) publishNotificationIntent(message.data, messageId:message.messageId);
      });
      _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
        if (generation == _generation) publishNotificationIntent(message.data, title:message.notification?.title, body:message.notification?.body, foreground:true);
      });
      final initialMessage = await messaging.getInitialMessage();
      if (generation == _generation && initialMessage != null) publishNotificationIntent(initialMessage.data, messageId:initialMessage.messageId);
      final token = await messaging.getToken();
      if (generation != _generation) return false;
      if (token != null && token.trim().length >= 20) {
        _pushToken = token.trim();
        _registered = await _register(_pushToken!, platform, generation);
      }

      if (generation != _generation) return false;
      _refreshSubscription = messaging.onTokenRefresh.listen(
        (refreshedToken) {
          final activeToken = _accessToken;
          final activeBaseUrl = _baseUrl;
          if (generation != _generation ||
              activeToken == null ||
              activeToken.length < 20 ||
              activeBaseUrl == null ||
              refreshedToken.trim().length < 20) {
            return;
          }
          _pushToken = refreshedToken.trim();
          unawaited(_register(_pushToken!, platform, generation));
        },
        onError: (_) {
          // Push é best-effort e nunca deve bloquear a operação.
        },
      );
      return _registered;
    } catch (_) {
      // Firebase/configuração/rede nunca deve impedir login ou corridas.
      return false;
    }
  }

  Future<void> stop() async {
    _generation++;
    await _openedSubscription?.cancel();
    await _foregroundSubscription?.cancel();
    _openedSubscription = null;
    _foregroundSubscription = null;
    clearNotificationIntents();
    _registered = false;
    _pushToken = null;
    _baseUrl = null;
    _accessToken = null;
    if (kIsWeb) {
      await stopBrowserPush();
      return;
    }
    final previousSubscription = _refreshSubscription;
    _refreshSubscription = null;
    await previousSubscription?.cancel();
  }

  Future<bool> _register(String token, String platform, int generation) async {
    final baseUrl = _baseUrl;
    final accessToken = _accessToken;
    if (generation != _generation ||
        baseUrl == null ||
        accessToken == null ||
        accessToken.length < 20) {
      return false;
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
              'notificationPreference': _allNotifications ? 'all' : 'important',
              'appVersion': DriverCoreConfig.appVersion,
              'buildNumber': DriverCoreConfig.appBuild,
            }),
          )
          .timeout(DriverCoreConfig.requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError(
          'Core recusou cadastro push (${response.statusCode}).',
        );
      }
      return generation == _generation;
    } catch (_) {
      // O token será tentado novamente no próximo login/refresh.
      return false;
    }
  }
}
