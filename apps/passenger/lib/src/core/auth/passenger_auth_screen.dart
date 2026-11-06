import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'auth_token_store.dart';
import 'password_auth_service.dart';

import '../config/ramo_core_config.dart';

class PassengerAuthScreen extends StatelessWidget {
  const PassengerAuthScreen({
    super.key,
    required this.service,
    required this.tokenStore,
    required this.onAuthenticated,
  });
  final PasswordAuthService service;
  final AuthTokenStore tokenStore;
  final ValueChanged<String> onAuthenticated;
  Future<void> _save(AuthSession session) async {
    if (session.subjectType != 'passenger') {
      throw const FormatException('Sessão inválida.');
    }
    try {
      await tokenStore.saveAccessToken(session.accessToken);
    } catch (_) {
      try {
        await service.logout(session.accessToken);
      } catch (_) {}
      rethrow;
    }
    onAuthenticated(session.accessToken);
  }

  @override
  Widget build(BuildContext context) => RamoPasswordAccessFlow(
    driver: false,
    heroImageUrl: RamoCoreConfig.baseUri
        ?.resolve('/v1/content/app-auth-branding/hero')
        .toString(),
    onRecoverPassword: RamoCoreConfig.baseUri == null ? null : () {
      Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => RamoPasswordRecovery(baseUri: RamoCoreConfig.baseUri!, driver: false),
      ));
    },
    onLogin: (values) async {
      await _save(
        await service.loginWithPassword(
          email: values.identifier,
          password: values.password,
        ),
      );
    },
    onRegister: (values) async {
      await _save(
        await service.registerWithPassword(
          fullName: values.fullName,
          phone: values.phone,
          email: values.email,
          password: values.password,
        ),
      );
    },
  );
}
