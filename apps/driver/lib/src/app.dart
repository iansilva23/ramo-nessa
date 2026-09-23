import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/config/driver_core_config.dart';
import 'core/location/driver_location_service.dart';
import 'core/navigation/driver_navigation_service.dart';
import 'features/home/data/driver_api.dart';
import 'features/home/data/driver_realtime_service.dart';
import 'features/home/presentation/driver_home_screen.dart';

class RamoNessaDriverApp extends StatelessWidget {
  const RamoNessaDriverApp({
    super.key,
    this.accessToken,
    this.api,
    this.locationService,
    this.navigationService,
    this.realtimeService,
  });

  final String? accessToken;
  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRealtimeService? realtimeService;

  @override
  Widget build(BuildContext context) {
    final coreUri = DriverCoreConfig.baseUri;
    final restoredToken = accessToken?.trim();
    final configuredToken = DriverCoreConfig.authToken.trim();
    final initialToken =
        restoredToken != null && restoredToken.length >= 20
            ? restoredToken
            : configuredToken.length >= 20
                ? configuredToken
                : null;

    Widget home(
      String? token, [
      Future<bool> Function()? logout,
    ]) =>
        DriverHomeScreen(
          accessToken: token,
          onLogout: logout,
          api: api,
          locationService: locationService,
          navigationService: navigationService,
          realtimeService: realtimeService,
        );

    final Widget homeWidget;
    if (coreUri == null) {
      homeWidget = home(initialToken);
    } else {
      homeWidget = MobileAuthGate(
        subjectType: 'driver',
        service: HttpPhoneAuthService(
          baseUrl: coreUri,
          subjectType: 'driver',
        ),
        tokenStore: SecureAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: DriverCoreConfig.devDriverIdentityEnabled,
        loginTitle: 'Ramo Nessa Motorista',
        loginSubtitle:
            'Entre com o celular aprovado no seu cadastro de motorista.',
        authenticatedBuilder: (token, logout) => home(token, logout),
      );
    }

    return MaterialApp(
      title: 'Ramo Nessa Motorista',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: homeWidget,
    );
  }
}
