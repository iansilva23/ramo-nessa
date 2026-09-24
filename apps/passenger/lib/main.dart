import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

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

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
      await pushCoordinator.initialize();
    }
  } catch (_) {
    // Firebase indisponível não pode impedir o app de abrir.
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

  runApp(
    RamoNessaPassengerApp(
      accessToken: accessToken,
      clientInstanceId: clientInstanceId,
      pushCoordinator: pushCoordinator,
    ),
  );
}
