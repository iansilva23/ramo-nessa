import 'features/registration/driver_registration_gate.dart';
import 'features/registration/driver_registration_service.dart';
import 'features/home/data/http_driver_api.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/communications/firebase_push_registration_service.dart';
import 'core/config/driver_core_config.dart';
import 'core/location/driver_location_service.dart';
import 'core/navigation/driver_navigation_service.dart';
import 'features/home/data/driver_api.dart';
import 'features/home/data/driver_realtime_service.dart';
import 'features/home/data/driver_route_service.dart';
import 'features/home/presentation/driver_home_screen.dart';
import 'features/profile/data/driver_privacy_service.dart';
import 'features/profile/data/http_driver_privacy_service.dart';
import 'preview/driver_preview_dependencies.dart';
import 'preview/preview_auth.dart';

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
    this.privacyService,
  });

  final String? accessToken;
  final String? clientInstanceId;
  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRouteService? routeService;
  final DriverRealtimeService? realtimeService;
  final DriverPrivacyService? privacyService;

  @override
  Widget build(BuildContext context) {
    final coreUri = DriverCoreConfig.baseUri;
    final preview =
        DriverCoreConfig.previewMode ? DriverPreviewDependencies() : null;
    final resolvedRouteService = routeService ??
        (DriverCoreConfig.previewMode && coreUri != null
            ? CoreDriverRouteService(baseUrl: coreUri)
            : preview?.route);
    final restoredToken = accessToken?.trim();
    final initialToken =
        restoredToken != null && restoredToken.length >= 20
            ? restoredToken
            : null;

    Widget home(
      String? token, [
      Future<bool> Function()? logout,
    ]) {
      final normalizedToken = token?.trim();
      final resolvedPrivacyService = privacyService ??
          (
            preview == null &&
                coreUri != null &&
                normalizedToken != null &&
                normalizedToken.length >= 20
              ? HttpDriverPrivacyService(
                  baseUrl: coreUri,
                  accessToken: normalizedToken,
                )
              : null
          );

      return DriverHomeScreen(
        accessToken: token,
        onLogout: logout,
        api: api ?? preview?.api,
        locationService: locationService ?? preview?.location,
        navigationService: navigationService ?? preview?.navigation,
        routeService: resolvedRouteService,
        realtimeService: realtimeService,
        privacyService: resolvedPrivacyService,
      );
    }

    final Widget homeWidget;
    if (DriverCoreConfig.previewMode) {
      homeWidget = MobileAuthGate(
        subjectType: 'driver',
        service: PreviewPhoneAuthService(subjectType: 'driver'),
        tokenStore: PreviewAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: false,
        loginTitle: 'Ramo Nessa Motorista',
        loginSubtitle:
            'Entre para testar o app. No Preview, o código é exibido na própria tela.',
        authenticatedBuilder: (token, logout) => home(token, logout),
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
            'Entre com seu WhatsApp ou cadastre-se para dirigir com a Ramo Nessa.',
        authenticatedBuilder: (token, logout) => token == null ? home(token, logout) : DriverRegistrationGate(
          key: ValueKey(token),
          service: HttpDriverRegistrationService(baseUrl: coreUri, accessToken: token),
          api: HttpDriverApi(baseUrl: coreUri, accessToken: token),
          logout: logout,
          homeBuilder: () => home(token, logout),
        ),
        onSessionReady: (token) =>
            DriverFirebasePushRegistrationService.instance.start(
              baseUrl: coreUri,
              accessToken: token,
            ),
        onSessionEnded:
            DriverFirebasePushRegistrationService.instance.stop,
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
