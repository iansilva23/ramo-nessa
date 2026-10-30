import 'features/rides/presentation/passenger_ride_chat_screen.dart';
import 'features/guide/data/local_guide_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_push/ramo_push.dart';

import 'core/auth/http_phone_auth_service.dart';
import 'core/auth/mobile_auth_gate.dart';
import 'core/auth/secure_auth_token_store.dart';
import 'core/communications/firebase_push_registration_service.dart';
import 'core/communications/social_links_service.dart';
import 'core/config/ramo_core_config.dart';
import 'core/location/location_service.dart';
import 'features/home/presentation/passenger_home_screen.dart';
import 'features/home/presentation/passenger_main_shell.dart';
import 'features/payments/data/passenger_payment_service.dart';
import 'features/map/data/core_place_search_service.dart';
import 'features/map/data/core_route_service.dart';
import 'features/map/data/place_search_service.dart';
import 'features/map/data/route_service.dart';
import 'features/pricing/data/pricing_policy_service.dart';
import 'features/pricing/data/pricing_quote_service.dart';
import 'features/rides/data/ride_preparation_service.dart';
import 'features/rides/data/http_ride_preparation_service.dart';
import 'features/rides/data/preparation_operation_journal.dart';
import 'features/rides/data/secure_preparation_operation_storage.dart';
import 'features/rides/data/preparation_recovery_coordinator.dart';
import 'features/rides/presentation/preparation_recovery_gate.dart';
import 'features/rides/data/passenger_ride_tracking_service.dart';
import 'features/rides/data/http_passenger_ride_tracking_service.dart';
import 'features/rides/data/passenger_ride_resume_service.dart';
import 'features/rides/presentation/resumed_ride_screen.dart';
import 'features/rides/data/passenger_ride_realtime_service.dart';
import 'features/tours/data/agency_tour_service.dart';
import 'passenger_session_services.dart';
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
    this.pricingPolicyService,
    this.pricingQuoteService,
    this.ridePreparationService,
    this.paymentService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.networkTilesEnabled = true,
    this.preparationReplayEnabled = const bool.fromEnvironment('RAMO_PREPARATION_REPLAY', defaultValue: false),
  });

  final String? accessToken;
  final String? clientInstanceId;
  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PricingPolicyService? pricingPolicyService;
  final PricingQuoteService? pricingQuoteService;
  final RidePreparationService? ridePreparationService;
  final PassengerPaymentService? paymentService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final bool networkTilesEnabled;
  final bool preparationReplayEnabled;

  @override
  Widget build(BuildContext context) {
    final coreUri = RamoCoreConfig.baseUri;
    final preview = RamoCoreConfig.previewMode
        ? PassengerPreviewDependencies()
        : null;
    final restoredToken = accessToken?.trim();
    final initialToken = restoredToken != null && restoredToken.length >= 20
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

    Widget buildShell(String? token, Future<bool> Function()? logout, PreparationOperationJournal? journal) {
      final normalizedToken = token?.trim();
      final services = PassengerSessionServices(
        coreUri: coreUri,
        accessToken: normalizedToken,
        clientInstanceId: clientInstanceId,
        preview: preview,
        paymentService: paymentService,
        preparationJournal: journal,
      );

      final resolvedPlaceSearchService =
          placeSearchService ??
          (RamoCoreConfig.previewMode
              ? coreUri == null
                    ? preview?.places
                    : CorePlaceSearchService(baseUrl: coreUri)
              : coreUri != null &&
                    normalizedToken != null &&
                    normalizedToken.length >= 20
              ? CorePlaceSearchService(
                  baseUrl: coreUri,
                  accessToken: normalizedToken,
                )
              : null);

      final resolvedRouteService =
          routeService ??
          (RamoCoreConfig.previewMode
              ? coreUri == null
                    ? preview?.route
                    : CoreRouteService(baseUrl: coreUri)
              : null);

      final resolvedTracking =
          rideTrackingService ??
          (coreUri != null && normalizedToken != null
              ? HttpPassengerRideTrackingService(
                  baseUrl: coreUri,
                  accessToken: normalizedToken,
                )
              : preview?.tracking);
      final shell = PassengerMainShell(
        key: ValueKey('passenger-shell-$normalizedToken'),
        accessToken: normalizedToken,
        onLogout: logout,
        authService: authService,
        paymentService: services.payments,
        activityService: services.activity,
        onOpenRideChat: resolvedTracking == null ? null : (context, rideId) async {
          await Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => PassengerRideChatScreen(service: resolvedTracking, rideId: rideId),
          ));
        },
        onResumeRide: resolvedTracking is! PassengerSelectedRideResumeService
            ? null
            : (context, ride) async {
                final data =
                    await (resolvedTracking
                            as PassengerSelectedRideResumeService)
                        .resumeSelectedRide(ride.id);
                if (!context.mounted) return;
                await Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (routeContext) => ResumedRideScreen(
                      data: data,
                      support: services.support is RamoRideSupportApi ? services.support as RamoRideSupportApi : null,
                      onClose: () => Navigator.of(routeContext).pop(),
                      tracking: resolvedTracking!,
                      payments: services.payments,
                      realtime: rideRealtimeService,
                      routes: resolvedRouteService,
                      networkTilesEnabled: networkTilesEnabled,
                    ),
                  ),
                );
              },
        savedPlaceService: services.savedPlaces,
        placeSearchService: resolvedPlaceSearchService,
        socialLinksService: socialLinksService,
        supportService: services.support,
        privacyService: services.privacy,
        tourService: tourService,
        guideService: coreUri == null
            ? const EmptyLocalGuideService()
            : HttpLocalGuideService(baseUrl: coreUri),
        previewMode: RamoCoreConfig.previewMode,
        homeBuilder: (openProfile, openGuide, guideDestination) =>
            PassengerHomeScreen(
              onOpenGuideLocal: openGuide,
              guideDestination: guideDestination,
              accessToken: normalizedToken,
              onLogout: logout,
              onOpenProfile: openProfile,
              locationService: locationService ?? preview?.location,
              routeService: resolvedRouteService,
              placeSearchService: resolvedPlaceSearchService,
              savedPlaceService: services.savedPlaces,
              pricingPolicyService: pricingPolicyService,
              pricingQuoteService: pricingQuoteService,
              ridePreparationService:
                  ridePreparationService ?? services.preparation,
              paymentService: services.payments,
              rideTrackingService: resolvedTracking,
              rideRealtimeService: rideRealtimeService,
              networkTilesEnabled: networkTilesEnabled,
            ),
      );
      final preparation = services.preparation;
      if (journal == null || preparation is! HttpRidePreparationService ||
          resolvedTracking is! PassengerSelectedRideResumeService ||
          resolvedTracking is! PassengerRideResumeService) {
        return shell;
      }
      return PreparationRecoveryGate(
        coordinator: PreparationRecoveryCoordinator(
          preparation: preparation,
          selected: resolvedTracking as PassengerSelectedRideResumeService,
          current: resolvedTracking as PassengerRideResumeService,
        ),
        buildRecovered: (data, close) => ResumedRideScreen(
          data: data, onClose: close, tracking: resolvedTracking!,
          payments: services.payments, realtime: rideRealtimeService,
          routes: resolvedRouteService, networkTilesEnabled: networkTilesEnabled,
          support: services.support is RamoRideSupportApi ? services.support as RamoRideSupportApi : null,
        ),
        child: shell,
      );
    }

    Widget shell(String? token, [Future<bool> Function()? logout]) {
      if (!preparationReplayEnabled || RamoCoreConfig.previewMode ||
          coreUri == null || authService == null || token == null ||
          token.trim().length < 20 || ridePreparationService != null) {
        return buildShell(token, logout, null);
      }
      return PreparationSessionGate(
        key: ValueKey('preparation-session-$token'),
        loadJournal: () => verifiedPreparationJournal(
          verifyAccount: () => authService.currentSession(token),
          coreUri: coreUri,
        ),
        builder: (journal) => buildShell(token, logout, journal),
      );
    }

    Widget permissions(String? token, Widget content) {
      const storage = FlutterSecureStorage();
      const key = kIsWeb
          ? 'ramo_nessa_permissions_passenger_web_v2'
          : 'ramo_nessa_permissions_passenger_v1';

      Future<bool> requestLocation() async {
        try {
          var permission = await Geolocator.checkPermission();
          if (permission == LocationPermission.denied) {
            permission = await Geolocator.requestPermission();
          }
          return permission == LocationPermission.always ||
              permission == LocationPermission.whileInUse;
        } catch (_) {
          return false;
        }
      }

      Future<bool> requestNotifications() async {
        final normalized = token?.trim();
        if (coreUri == null || normalized == null || normalized.length < 20) {
          return false;
        }
        try {
          return await FirebasePushRegistrationService.instance.start(
            baseUrl: coreUri,
            accessToken: normalized,
            requestPermission: true,
          );
        } catch (_) {
          return false;
        }
      }

      return RamoPermissionOnboardingGate(
        role: 'passenger',
        web: kIsWeb,
        readWebSetup: kIsWeb ? browserSetupSnapshot : null,
        requestWebLocation: kIsWeb ? requestBrowserSetupLocation : null,
        installWebApp: kIsWeb ? installBrowserSetupApp : null,
        readCompleted: () async => (await storage.read(key: key)) == 'yes',
        saveCompleted: () => storage.write(key: key, value: 'yes'),
        requestLocation: requestLocation,
        requestNotifications: requestNotifications,
        notificationHelp:
            FirebasePushRegistrationService.instance.notificationHelp,
        readNotificationPreference:
            FirebasePushRegistrationService.instance.readAllNotifications,
        saveNotificationPreference: (all) async {
          final synced = await FirebasePushRegistrationService.instance
              .setAllNotifications(all);
          if (!synced) throw StateError('Preferência dos avisos pendente.');
        },
        child: content,
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
        authenticatedBuilder: (token, logout) =>
            permissions(token, shell(token, logout)),
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
            'Informe seu celular. Vamos enviar um código pelo WhatsApp para confirmar sua conta.',
        authenticatedBuilder: (token, logout) =>
            permissions(token, shell(token, logout)),
        onSessionReady: (token) => FirebasePushRegistrationService.instance
            .restore(baseUrl: coreUri, accessToken: token),
        onSessionEnded: FirebasePushRegistrationService.instance.stop,
      );
    }

    return ValueListenableBuilder<ThemeMode>(
      valueListenable: RamoAppearance.instance,
      builder: (context, themeMode, _) => MaterialApp(
        title: 'Ramo Nessa',
        debugShowCheckedModeBanner: false,
        theme: RamoTheme.light,
        darkTheme: RamoTheme.dark,
        themeMode: themeMode,
        home: homeWidget,
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
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
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

