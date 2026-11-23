import 'dart:async';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'src/app.dart';
import 'src/core/auth/secure_auth_token_store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _PassengerBootstrap());
}

class _BootstrapData {
  const _BootstrapData({
    this.accessToken,
    this.clientInstanceId,
  });

  final String? accessToken;
  final String? clientInstanceId;
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
      const Duration(milliseconds: 3000),
    );

    const appearanceStorage = FlutterSecureStorage();
    await RamoAppearance.instance.initialize(
      read: () => appearanceStorage.read(key: 'ramo_appearance_v1'),
      save: (value) => appearanceStorage.write(key: 'ramo_appearance_v1', value: value),
    );
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
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return ValueListenableBuilder<ThemeMode>(
        valueListenable: RamoAppearance.instance,
        builder: (context, themeMode, _) => MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: RamoTheme.light,
          darkTheme: RamoTheme.dark,
          themeMode: themeMode,
          home: const RamoStartupSplash(label: 'VAMOS NESSA'),
        ),
      );
    }
    return RamoNessaPassengerApp(
      accessToken: data.accessToken,
      clientInstanceId: data.clientInstanceId,
    );
  }
}
