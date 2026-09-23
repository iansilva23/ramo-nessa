import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/core/auth/secure_auth_token_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final tokenStore = SecureAuthTokenStore();
  String? accessToken;
  try {
    accessToken = await tokenStore.readAccessToken();
  } catch (_) {
    // Falha no Keychain/Keystore não pode impedir o app de abrir.
  }

  runApp(RamoNessaPassengerApp(accessToken: accessToken));
}
