import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/communications/social_links_service.dart';
import 'core/config/ramo_core_config.dart';
import 'core/location/location_service.dart';
import 'features/home/presentation/passenger_home_screen.dart';
import 'features/home/presentation/passenger_main_shell.dart';
import 'features/payments/data/passenger_payment_service.dart';
import 'features/profile/data/http_passenger_saved_place_service.dart';
import 'features/map/data/core_place_search_service.dart';
import 'features/map/data/place_search_service.dart';
import 'features/map/data/route_service.dart';
import 'features/pricing/data/pricing_quote_service.dart';
import 'features/rides/data/http_passenger_activity_service.dart';
import 'features/rides/data/ride_preparation_service.dart';
import 'features/rides/data/passenger_ride_tracking_service.dart';
import 'features/rides/data/passenger_ride_realtime_service.dart';
import 'features/tours/data/agency_tour_service.dart';
import 'preview/passenger_preview_dependencies.dart';
import 'preview/preview_auth.dart';

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
  final bool networkTilesEnabled;

  @override
  Widget build(BuildContext context) {
    final coreUri = RamoCoreConfig.baseUri;
    final preview =
        RamoCoreConfig.previewMode ? PassengerPreviewDependencies() : null;
    final restoredToken = accessToken?.trim();
    final initialToken =
        restoredToken != null && restoredToken.length >= 20
            ? restoredToken
            : null;

    final socialLinksService = coreUri == null
        ? null
        : HttpSocialLinksService(baseUrl: coreUri);

    final AgencyTourService tourService =
        RamoCoreConfig.previewMode || coreUri == null
            ? const PreviewAgencyTourService()
            : HttpAgencyTourService(baseUrl: coreUri);

    final authService = coreUri == null
        ? null
        : HttpPhoneAuthService(
            baseUrl: coreUri,
            subjectType: 'passenger',
            clientInstanceId: clientInstanceId,
          );

    Widget shell(
      String? token, [
      Future<bool> Function()? logout,
    ]) {
      final normalizedToken = token?.trim();
      final activityService = RamoCoreConfig.previewMode
          ? preview?.activity
          : coreUri != null &&
                  normalizedToken != null &&
                  normalizedToken.length >= 20
              ? HttpPassengerActivityService(
                  baseUrl: coreUri,
                  accessToken: normalizedToken,
                )
              : null;

      final resolvedPlaceSearchService =
          placeSearchService ??
              preview?.places ??
              (coreUri != null &&
                      normalizedToken != null &&
                      normalizedToken.length >= 20
                  ? CorePlaceSearchService(
                      baseUrl: coreUri,
                      accessToken: normalizedToken,
                    )
                  : null);

      final savedPlaceService =
          coreUri != null &&
                  normalizedToken != null &&
                  normalizedToken.length >= 20
              ? HttpPassengerSavedPlaceService(
                  baseUrl: coreUri,
                  accessToken: normalizedToken,
                )
              : null;

      return PassengerMainShell(
        accessToken: normalizedToken,
        onLogout: logout,
        authService: authService,
        paymentService: paymentService ?? preview?.payments,
        activityService: activityService,
        savedPlaceService: savedPlaceService,
        placeSearchService: resolvedPlaceSearchService,
        socialLinksService: socialLinksService,
        tourService: tourService,
        previewMode: RamoCoreConfig.previewMode,
        homeBuilder: (openProfile) => PassengerHomeScreen(
          accessToken: normalizedToken,
          onLogout: logout,
          onOpenProfile: openProfile,
          locationService: locationService ?? preview?.location,
          routeService: routeService ?? preview?.route,
          placeSearchService: resolvedPlaceSearchService,
          savedPlaceService: savedPlaceService,
          pricingQuoteService: pricingQuoteService ?? preview?.pricing,
          ridePreparationService:
              ridePreparationService ?? preview?.ridePreparation,
          paymentService: paymentService ?? preview?.payments,
          rideTrackingService: rideTrackingService ?? preview?.tracking,
          rideRealtimeService: rideRealtimeService,
          networkTilesEnabled: networkTilesEnabled,
        ),
      );
    }

    final Widget homeWidget;
    if (RamoCoreConfig.previewMode) {
      homeWidget = MobileAuthGate(
        subjectType: 'passenger',
        service: PreviewPhoneAuthService(subjectType: 'passenger'),
        tokenStore: PreviewAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: false,
        loginTitle: 'Entre no Ramo Nessa',
        loginSubtitle:
            'Entre para testar o app. No Preview, o código é exibido na própria tela.',
        authenticatedBuilder: (token, logout) => shell(token, logout),
      );
    } else if (coreUri == null && kReleaseMode) {
      homeWidget = const _CoreConfigurationError();
    } else if (coreUri == null) {
      homeWidget = shell(initialToken);
    } else {
      homeWidget = MobileAuthGate(
        subjectType: 'passenger',
        service: authService!,
        tokenStore: SecureAuthTokenStore(),
        initialAccessToken: initialToken,
        devBypass: RamoCoreConfig.devPassengerIdentityEnabled,
        loginTitle: 'Entre no Ramo Nessa',
        loginSubtitle:
            'Informe seu celular. Vamos enviar um código por SMS para confirmar sua conta.',
        authenticatedBuilder: (token, logout) => shell(token, logout),
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
                  'Não foi possível concluir a configuração necessária para iniciar o app.',
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
