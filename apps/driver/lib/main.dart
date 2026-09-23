import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/core/auth/secure_auth_token_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final tokenStore = SecureAuthTokenStore();
  String? accessToken;
  String? clientInstanceId;
  try {
    accessToken = await tokenStore.readAccessToken();
  } catch (_) {
    // Falha no Keystore não pode impedir o app de abrir.
  }

  try {
    clientInstanceId = await tokenStore.getOrCreateClientInstanceId();
  } catch (_) {
    // O rate-limit por IP/telefone continua ativo se o storage indisponível.
  }

  runApp(
    RamoNessaDriverApp(
      accessToken: accessToken,
      clientInstanceId: clientInstanceId,
    ),
  );
}
