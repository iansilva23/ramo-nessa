import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'auth_token_store.dart';
import 'password_auth_service.dart';
import 'driver_password_auth_service.dart';
import '../config/driver_core_config.dart';

class DriverPasswordLoginScreen extends StatelessWidget {
  const DriverPasswordLoginScreen({
    super.key,
    required this.phoneService,
    required this.passwordService,
    required this.tokenStore,
    required this.onAuthenticated,
  });
  final PasswordAuthService phoneService;
  final DriverPasswordAuthService passwordService;
  final AuthTokenStore tokenStore;
  final ValueChanged<String> onAuthenticated;
  Future<void> _save(AuthSession session) async {
    if (session.subjectType != 'driver') {
      throw const FormatException('Sessão inválida.');
    }
    try {
      await tokenStore.saveAccessToken(session.accessToken);
    } catch (_) {
      try {
        await phoneService.logout(session.accessToken);
      } catch (_) {}
      rethrow;
    }
    onAuthenticated(session.accessToken);
  }

  @override
  Widget build(BuildContext context) => RamoPasswordAccessFlow(
    driver: true,
    heroImageUrl: DriverCoreConfig.baseUri
        ?.resolve('/v1/content/app-auth-branding/hero')
        .toString(),
    onRecoverPassword: DriverCoreConfig.baseUri == null ? null : () {
      Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => RamoPasswordRecovery(baseUri: DriverCoreConfig.baseUri!, driver: true),
      ));
    },
    onLogin: (values) async {
      await _save(
        await passwordService.loginWithPassword(
          identifier: values.identifier,
          password: values.password,
        ),
      );
    },
    onRegister: (values) async {
      await _save(
        await phoneService.registerWithPassword(
          fullName: values.fullName,
          phone: values.phone,
          email: values.email,
          password: values.password,
          username: values.username,
        ),
      );
    },
  );
}
