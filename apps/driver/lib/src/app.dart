import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/config/driver_core_config.dart';
import 'core/location/driver_location_service.dart';
import 'core/notifications/firebase_push_coordinator.dart';
import 'core/notifications/push_foreground_listener.dart';
import 'core/navigation/driver_navigation_service.dart';
import 'features/home/data/driver_api.dart';
import 'features/home/data/driver_realtime_service.dart';
import 'features/home/data/driver_route_service.dart';
import 'features/home/presentation/driver_home_screen.dart';
import 'preview/driver_preview_dependencies.dart';

class RamoNessaDriverApp extends StatelessWidget {
  const RamoNessaDriverApp({
    super.key,
    this.accessToken,
    this.clientInstanceId,
    this.api,
    this.locationService,
    this.navigationService,
    this.routeService,
    this.realtimeService,
    this.pushCoordinator,
  });

  final String? accessToken;
  final String? clientInstanceId;
  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRouteService? routeService;
  final DriverRealtimeService? realtimeService;
  final FirebasePushCoordinator? pushCoordinator;

  @override
  Widget build(BuildContext context) {
    final coreUri = DriverCoreConfig.baseUri;
    final preview =
        DriverCoreConfig.previewMode ? DriverPreviewDependencies() : null;
    final restoredToken = accessToken?.trim();
    final initialToken =
        restoredToken != null && restoredToken.length >= 20
            ? restoredToken
            : null;

    Widget home(
      String? token, [
      Future<bool> Function()? logout,
    ]) =>
        DriverHomeScreen(
          accessToken: token,
          onLogout: logout,
          api: api ?? preview?.api,
          locationService: locationService ?? preview?.location,
          navigationService: navigationService ?? preview?.navigation,
          routeService: routeService ?? preview?.route,
          realtimeService: realtimeService,
          pushCoordinator: pushCoordinator,
        );

    final Widget homeWidget;
    if (DriverCoreConfig.previewMode) {
      homeWidget = home(
        null,
        () async => true,
      );
    } else if (coreUri == null && kReleaseMode) {
      homeWidget = const _CoreConfigurationError();
    } else if (coreUri == null) {
      homeWidget = home(initialToken);
    } else {
      homeWidget = MobileAuthGate(
        subjectType: 'driver',
        service: HttpPhoneAuthService(
          baseUrl: coreUri,
          subjectType: 'driver',
          clientInstanceId: clientInstanceId,
        ),
        tokenStore: SecureAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: DriverCoreConfig.devDriverIdentityEnabled,
        loginTitle: 'Ramo Nessa Motorista',
        loginSubtitle:
            'Entre com o celular aprovado no seu cadastro de motorista.',
        authenticatedBuilder: (token, logout) => home(token, logout),
        onSessionReady: pushCoordinator?.bindSession,
        onSessionEnded: pushCoordinator?.unbindSession,
      );
    }

    return MaterialApp(
      title: 'Ramo Nessa Motorista',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: PushForegroundListener(
        coordinator: pushCoordinator,
        child: homeWidget,
      ),
    );
  }
}


class _CoreConfigurationError extends StatelessWidget {
  const _CoreConfigurationError();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off_rounded, size: 48),
                SizedBox(height: 16),
                Text(
                  'Aplicativo ainda não está conectado ao servidor.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 10),
                Text(
                  'Instalação de produção sem configuração segura do Core.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
