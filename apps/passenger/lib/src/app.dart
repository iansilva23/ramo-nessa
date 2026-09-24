import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/config/ramo_core_config.dart';
import 'core/location/location_service.dart';
import 'core/notifications/firebase_push_coordinator.dart';
import 'core/notifications/push_foreground_listener.dart';
import 'features/home/presentation/passenger_home_screen.dart';
import 'features/payments/data/passenger_payment_service.dart';
import 'features/map/data/place_search_service.dart';
import 'features/map/data/route_service.dart';
import 'features/pricing/data/pricing_quote_service.dart';
import 'features/rides/data/ride_preparation_service.dart';
import 'features/rides/data/passenger_ride_tracking_service.dart';
import 'features/rides/data/passenger_ride_realtime_service.dart';

class RamoNessaPassengerApp extends StatelessWidget {
  const RamoNessaPassengerApp({
    super.key,
    this.accessToken,
    this.clientInstanceId,
    this.locationService,
    this.routeService,
    this.placeSearchService,
    this.pricingQuoteService,
    this.ridePreparationService,
    this.paymentService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.pushCoordinator,
    this.networkTilesEnabled = true,
  });

  final String? accessToken;
  final String? clientInstanceId;
  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PricingQuoteService? pricingQuoteService;
  final RidePreparationService? ridePreparationService;
  final PassengerPaymentService? paymentService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final FirebasePushCoordinator? pushCoordinator;
  final bool networkTilesEnabled;

  @override
  Widget build(BuildContext context) {
    final coreUri = RamoCoreConfig.baseUri;
    final restoredToken = accessToken?.trim();
    final initialToken =
        restoredToken != null && restoredToken.length >= 20
            ? restoredToken
            : null;

    Widget home(
      String? token, [
      Future<bool> Function()? logout,
    ]) =>
        PassengerHomeScreen(
          accessToken: token,
          onLogout: logout,
          locationService: locationService,
          routeService: routeService,
          placeSearchService: placeSearchService,
          pricingQuoteService: pricingQuoteService,
          ridePreparationService: ridePreparationService,
          paymentService: paymentService,
          rideTrackingService: rideTrackingService,
          rideRealtimeService: rideRealtimeService,
          networkTilesEnabled: networkTilesEnabled,
        );

    final Widget homeWidget;
    if (coreUri == null && kReleaseMode) {
      homeWidget = const _CoreConfigurationError();
    } else if (coreUri == null) {
      homeWidget = home(initialToken);
    } else {
      homeWidget = MobileAuthGate(
        subjectType: 'passenger',
        service: HttpPhoneAuthService(
          baseUrl: coreUri,
          subjectType: 'passenger',
          clientInstanceId: clientInstanceId,
        ),
        tokenStore: SecureAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: RamoCoreConfig.devPassengerIdentityEnabled,
        loginTitle: 'Entre no Ramo Nessa',
        loginSubtitle:
            'Informe seu celular. Vamos enviar um código para confirmar sua conta.',
        authenticatedBuilder: (token, logout) => home(token, logout),
        onSessionReady: pushCoordinator?.bindSession,
        onSessionEnded: pushCoordinator?.unbindSession,
      );
    }

    return MaterialApp(
      title: 'Ramo Nessa',
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
