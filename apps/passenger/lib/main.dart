import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'firebase_options.dart';
import 'src/app.dart';
import 'src/core/auth/secure_auth_token_store.dart';
import 'src/core/config/ramo_core_config.dart';
import 'src/core/notifications/firebase_push_coordinator.dart';
import 'src/core/notifications/http_push_device_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _PassengerBootstrap());
}

class _BootstrapData {
  const _BootstrapData({
    this.accessToken,
    this.clientInstanceId,
    this.pushCoordinator,
  });

  final String? accessToken;
  final String? clientInstanceId;
  final FirebasePushCoordinator? pushCoordinator;
}

class _PassengerBootstrap extends StatefulWidget {
  const _PassengerBootstrap();

  @override
  State<_PassengerBootstrap> createState() => _PassengerBootstrapState();
}

class _PassengerBootstrapState extends State<_PassengerBootstrap> {
  _BootstrapData? _data;

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final minimumSplash = Future<void>.delayed(
      const Duration(milliseconds: 1050),
    );

    FirebasePushCoordinator? pushCoordinator;
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );

      final coreUri = RamoCoreConfig.baseUri;
      if (coreUri != null) {
        pushCoordinator = FirebasePushCoordinator(
          registry: HttpPushDeviceService(baseUrl: coreUri),
        );
        await pushCoordinator
            .initialize()
            .timeout(const Duration(seconds: 4));
      }
    } catch (_) {
      // Firebase/push nunca pode bloquear a abertura do aplicativo.
    }

    final tokenStore = SecureAuthTokenStore();
    String? accessToken;
    String? clientInstanceId;

    try {
      accessToken = await tokenStore.readAccessToken();
    } catch (_) {
      // Falha no Keychain/Keystore não pode impedir o app de abrir.
    }

    try {
      clientInstanceId = await tokenStore.getOrCreateClientInstanceId();
    } catch (_) {
      // O rate-limit por IP/telefone continua ativo se o storage indisponível.
    }

    await minimumSplash;
    if (!mounted) return;

    setState(() {
      _data = _BootstrapData(
        accessToken: accessToken,
        clientInstanceId: clientInstanceId,
        pushCoordinator: pushCoordinator,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: RamoTheme.light,
        darkTheme: RamoTheme.dark,
        themeMode: ThemeMode.system,
        home: const RamoStartupSplash(label: 'VAMOS NESSA'),
      );
    }

    return RamoNessaPassengerApp(
      accessToken: data.accessToken,
      clientInstanceId: data.clientInstanceId,
      pushCoordinator: data.pushCoordinator,
    );
  }
}
