import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/config/ramo_core_config.dart';
import 'core/location/location_service.dart';
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
    this.locationService,
    this.routeService,
    this.placeSearchService,
    this.pricingQuoteService,
    this.ridePreparationService,
    this.paymentService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.networkTilesEnabled = true,
  });

  final String? accessToken;
  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PricingQuoteService? pricingQuoteService;
  final RidePreparationService? ridePreparationService;
  final PassengerPaymentService? paymentService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
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
    if (coreUri == null) {
      homeWidget = home(initialToken);
    } else {
      homeWidget = MobileAuthGate(
        subjectType: 'passenger',
        service: HttpPhoneAuthService(
          baseUrl: coreUri,
          subjectType: 'passenger',
        ),
        tokenStore: SecureAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: RamoCoreConfig.devPassengerIdentityEnabled,
        loginTitle: 'Entre no Ramo Nessa',
        loginSubtitle:
            'Informe seu celular. Vamos enviar um código para confirmar sua conta.',
        authenticatedBuilder: (token, logout) => home(token, logout),
      );
    }

    return MaterialApp(
      title: 'Ramo Nessa',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: homeWidget,
    );
  }
}
