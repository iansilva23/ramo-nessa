import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'src/app.dart';
import 'src/core/auth/secure_auth_token_store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _DriverBootstrap());
}

class _BootstrapData {
  const _BootstrapData({
    this.accessToken,
    this.clientInstanceId,
  });

  final String? accessToken;
  final String? clientInstanceId;
}

class _DriverBootstrap extends StatefulWidget {
  const _DriverBootstrap();

  @override
  State<_DriverBootstrap> createState() => _DriverBootstrapState();
}

class _DriverBootstrapState extends State<_DriverBootstrap> {
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
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: RamoTheme.light,
        darkTheme: RamoTheme.dark,
        themeMode: ThemeMode.system,
        home: const RamoStartupSplash(label: 'MOTORISTA'),
      );
    }

    return RamoNessaDriverApp(
      accessToken: data.accessToken,
      clientInstanceId: data.clientInstanceId,
    );
  }
}
