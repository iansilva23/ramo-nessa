import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../../core/location/geolocator_location_service.dart';
import '../../../core/location/location_service.dart';
import '../../../core/communications/app_release_policy_service.dart';
import '../../../core/communications/agency_promotion_service.dart';
import '../../map/data/core_place_search_service.dart';
import '../../map/data/place_autocomplete_service.dart';
import '../../map/data/core_route_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/data/route_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../profile/data/passenger_saved_place_service.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/data/pricing_policy_service.dart';
import '../../rides/data/http_ride_preparation_service.dart';
import '../../rides/data/ride_preparation_service.dart';
import '../../rides/data/http_passenger_ride_tracking_service.dart';
import '../../rides/data/io_passenger_ride_realtime_service.dart';
import '../../rides/data/passenger_ride_realtime_service.dart';
import '../../rides/data/passenger_ride_tracking_service.dart';
import '../../payments/data/http_passenger_payment_service.dart';
import '../../payments/data/passenger_payment_service.dart';
import '../../payments/presentation/ride_payment_screen.dart';
import '../../service_area/domain/service_area_policy.dart';
import '../domain/service_type.dart';
import 'destination_search_screen.dart';
import 'vehicle_selection_screen.dart';
import 'widgets/ramo_live_map.dart';
import 'widgets/ride_bottom_sheet.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({
    super.key,
    this.accessToken,
    this.onLogout,
    this.onOpenProfile,
    this.locationService,
    this.routeService,
    this.placeSearchService,
    this.savedPlaceService,
    this.pricingPolicyService,
    this.ridePreparationService,
    this.paymentService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.releasePolicyService,
    this.agencyPromotionService,
    this.networkTilesEnabled = true,
  });

  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final VoidCallback? onOpenProfile;
  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PassengerSavedPlaceService? savedPlaceService;
  final PricingPolicyService? pricingPolicyService;
  final RidePreparationService? ridePreparationService;
  final PassengerPaymentService? paymentService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final AppReleasePolicyService? releasePolicyService;
  final AgencyPromotionService? agencyPromotionService;
  final bool networkTilesEnabled;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  final RamoMapController _mapController = RamoMapController();

  late final String _accessToken = widget.accessToken?.trim() ?? '';
  late final bool _authenticated =
      RamoCoreConfig.enabled &&
      (_accessToken.length >= 20 ||
          RamoCoreConfig.devPassengerIdentityEnabled);

  late final LocationService _locationService =
      widget.locationService ?? GeolocatorLocationService();
  late final RouteService _routeService =
      widget.routeService ??
          (RamoCoreConfig.enabled
              ? CoreRouteService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                )
              : const _UnavailableRouteService());
  late final PlaceSearchService _placeSearchService =
      widget.placeSearchService ??
          (RamoCoreConfig.enabled
              ? CorePlaceSearchService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                )
              : const _UnavailablePlaceSearchService());
  late final PricingPolicyService? _pricingPolicyService =
      widget.pricingPolicyService ??
          (RamoCoreConfig.enabled
              ? HttpPricingPolicyService(
                  baseUrl: RamoCoreConfig.baseUri!,
                )
              : null);

  late final RidePreparationService? _ridePreparationService =
      widget.ridePreparationService ??
          (_authenticated
              ? HttpRidePreparationService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                  passengerId: RamoCoreConfig.devPassengerId,
                )
              : null);

  late final PassengerPaymentService? _paymentService =
      widget.paymentService ??
          (_authenticated
              ? HttpPassengerPaymentService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                  passengerId: RamoCoreConfig.devPassengerId,
                )
              : null);

  late final PassengerRideTrackingService? _rideTrackingService =
      widget.rideTrackingService ??
          (_authenticated
              ? HttpPassengerRideTrackingService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                  passengerId: RamoCoreConfig.devPassengerId,
                )
              : null);

  late final PassengerRideRealtimeService? _rideRealtimeService =
      widget.rideRealtimeService ??
          (_authenticated
              ? IoPassengerRideRealtimeService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                  passengerId: RamoCoreConfig.devPassengerId,
                )
              : null);

  late final AppReleasePolicyService? _releasePolicyService =
      widget.releasePolicyService ??
          (RamoCoreConfig.enabled
              ? HttpAppReleasePolicyService(
                  baseUrl: RamoCoreConfig.baseUri!,
                )
              : null);

  late final AgencyPromotionService? _agencyPromotionService =
      widget.agencyPromotionService ??
          (RamoCoreConfig.enabled
              ? HttpAgencyPromotionService(
                  baseUrl: RamoCoreConfig.baseUri!,
                )
              : null);

  RamoPlace? _origin;
  RamoPlace? _destination;
  RouteInfo? _route;
  String? _coverageMessage;
  String? _serviceAreaLabel;
  bool _mapReady = false;
  bool _locating = false;
  bool _routeLoading = false;
  bool _preparingRide = false;
  int _routeRequestId = 0;
  AgencyPromotion? _agencyPromotion;
  PassengerPricingPolicy? _pricingPolicy;
  bool _releaseDialogShown = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _locateUser(showErrors: false);
      _loadCommunicationContent();
      _loadPricingPolicy();
    });
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  String? get _platformName {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      default:
        return null;
    }
  }

  Future<void> _loadCommunicationContent() async {
    final platform = _platformName;
    final releaseService = _releasePolicyService;
    if (platform != null && releaseService != null) {
      try {
        final policy = await releaseService.check(
          appKind: 'passenger',
          platform: platform,
          buildNumber: RamoCoreConfig.appBuild,
        );
        if (
          mounted &&
          policy.updateAvailable &&
          !_releaseDialogShown
        ) {
          _releaseDialogShown = true;
          await _showReleasePolicy(policy);
        }
      } catch (_) {
        // Falha de comunicação não bloqueia o uso do app.
      }
    }

    final agencyService = _agencyPromotionService;
    if (agencyService == null) return;
    try {
      final promotion = await agencyService.load();
      if (!mounted) return;
      setState(() => _agencyPromotion = promotion);
    } catch (_) {
      // A divulgação é opcional e não interfere na corrida.
    }
  }

  Future<void> _openReleaseStore(
    AppReleasePolicy policy,
  ) async {
    final rawUrl = policy.storeUrl?.trim();
    if (rawUrl == null || rawUrl.isEmpty) return;

    final uri = Uri.tryParse(rawUrl);
    if (uri == null) return;

    final launched = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Não foi possível abrir a loja agora.',
          ),
        ),
      );
    }
  }

  Future<void> _showReleasePolicy(
    AppReleasePolicy policy,
  ) {
    final hasStoreUrl =
        policy.storeUrl?.trim().isNotEmpty == true;

    return showDialog<void>(
      context: context,
      barrierDismissible: !policy.updateRequired,
      builder: (dialogContext) => PopScope(
        canPop: !policy.updateRequired,
        child: AlertDialog(
          icon: Icon(
            policy.updateRequired
                ? Icons.system_update_alt_rounded
                : Icons.new_releases_rounded,
          ),
          title: Text(
            policy.updateRequired
                ? 'Atualização necessária'
                : 'Atualização disponível',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(policy.updateMessage),
              const SizedBox(height: 10),
              Text(
                'Versão disponível: ${policy.latestVersion}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (hasStoreUrl) ...[
                const SizedBox(height: 10),
                const Text(
                  'Toque em “Atualizar agora” para abrir a loja.',
                ),
              ] else if (policy.updateRequired) ...[
                const SizedBox(height: 10),
                const Text(
                  'O link da atualização ainda não está disponível. '
                  'Tente novamente mais tarde.',
                ),
              ],
            ],
          ),
          actions: [
            if (!policy.updateRequired)
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Agora não'),
              ),
            TextButton(
              onPressed: hasStoreUrl
                  ? () async {
                      await _openReleaseStore(policy);
                      if (
                        !policy.updateRequired &&
                        dialogContext.mounted
                      ) {
                        Navigator.of(dialogContext).pop();
                      }
                    }
                  : policy.updateRequired
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
              child: Text(
                hasStoreUrl
                    ? 'Atualizar agora'
                    : policy.updateRequired
                        ? 'Atualização indisponível'
                        : 'Entendi',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openAgencyPromotion() {
    final promotion = _agencyPromotion;
    if (promotion == null || !promotion.enabled) {
      return Future<void>.value();
    }

    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.sm,
            RamoSpacing.lg,
            RamoSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.explore_rounded),
                  SizedBox(width: RamoSpacing.sm),
                  Text(
                    'RAMO NESSA AGÊNCIA',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: .8,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: RamoSpacing.md),
              Text(
                promotion.title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: RamoSpacing.xs),
              Text(
                promotion.subtitle,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: RamoSpacing.md),
              Text(promotion.description),
              const SizedBox(height: RamoSpacing.lg),
              FilledButton.icon(
                onPressed: () async {
                  final rawUrl = promotion.ctaUrl;
                  if (rawUrl == null) {
                    Navigator.of(context).pop();
                    return;
                  }

                  final uri = Uri.tryParse(rawUrl);
                  if (uri == null) return;
                  final opened = await launchUrl(
                    uri,
                    mode: LaunchMode.externalApplication,
                  );
                  if (!context.mounted || opened) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Não conseguimos abrir esse link agora.',
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.tour_rounded),
                label: Text(promotion.ctaLabel),
              ),
              if (promotion.ctaUrl != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                const Text(
                  'Contato / reservas:',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: RamoSpacing.xxs),
                SelectableText(promotion.ctaUrl!),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _locateUser({bool showErrors = true}) async {
    if (_locating) {
      return;
    }

    setState(() => _locating = true);

    try {
      final location = await _locationService.getCurrentLocation();
      if (!mounted) {
        return;
      }

      var origin = RamoPlace(
        name: 'Minha localização',
        address: 'Localização atual do aparelho',
        position: location,
      );

      final placeSearch = _placeSearchService;
      final coordinateResolver =
          placeSearch is CoordinatePlaceResolver
              ? placeSearch as CoordinatePlaceResolver
              : null;
      if (coordinateResolver != null) {
        try {
          final classified =
              await coordinateResolver.classifyCoordinate(location);
          if (classified != null) {
            origin = RamoPlace(
              name: 'Minha localização',
              address: classified.address,
              position: location,
              providerPlaceId: classified.providerPlaceId,
              approvedPricingZoneId:
                  classified.approvedPricingZoneId,
              approvedPricingLocalityId:
                  classified.approvedPricingLocalityId,
              placeProof: classified.placeProof,
            );
          }
        } catch (_) {
          // A classificação remota é autoritativa para preço, mas não
          // deve impedir o mapa de mostrar o GPS enquanto a rede oscila.
        }
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _origin = origin;
        _locating = false;
        _coverageMessage = null;
        _serviceAreaLabel = null;
      });

      if (_mapReady) {
        unawaited(_mapController.move(location, 16));
      }

      if (_destination != null) {
        await _loadRoute();
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() => _locating = false);

      if (showErrors) {
        _showMessage(
          error is LocationServiceException
              ? error.message
              : 'Não conseguimos obter sua localização agora.',
        );
      }
    }
  }

  Future<RamoPlace?> _searchPlace({
    required String title,
    required String emptyTitle,
    bool showSavedPlaces = false,
  }) {
    return Navigator.of(context).push<RamoPlace>(
      MaterialPageRoute(
        builder: (_) => DestinationSearchScreen(
          searchService: _placeSearchService,
          autocompleteService:
              _placeSearchService is PlaceAutocompleteService
                  ? _placeSearchService as PlaceAutocompleteService
                  : null,
          title: title,
          emptyTitle: emptyTitle,
          savedPlaceService:
              showSavedPlaces ? widget.savedPlaceService : null,
        ),
      ),
    );
  }

  Future<void> _chooseOrigin() async {
    final origin = await _searchPlace(
      title: 'Escolher origem',
      emptyTitle: 'Busque sua origem',
    );

    if (origin == null || !mounted) {
      return;
    }

    _routeRequestId++;

    setState(() {
      _origin = origin;
      _route = null;
      _routeLoading = false;
      _coverageMessage = null;
      _serviceAreaLabel = null;
    });

    if (_destination != null) {
      await _loadRoute();
    } else if (_mapReady) {
      unawaited(_mapController.move(origin.position, 16));
    }
  }

  void _clearDestination() {
    _routeRequestId++;
    setState(() {
      _destination = null;
      _route = null;
      _routeLoading = false;
      _coverageMessage = null;
      _serviceAreaLabel = null;
    });

    final origin = _origin;
    if (_mapReady && origin != null) {
      unawaited(_mapController.move(origin.position, 16));
    }
  }

  Future<void> _chooseDestination() async {
    final destination = await _searchPlace(
      title: 'Escolher destino',
      emptyTitle: 'Busque seu destino',
      showSavedPlaces: true,
    );

    if (destination == null || !mounted) {
      return;
    }

    _routeRequestId++;

    setState(() {
      _destination = destination;
      _route = null;
      _routeLoading = false;
      _coverageMessage = null;
      _serviceAreaLabel = null;
    });

    if (_origin == null) {
      await _locateUser();
      return;
    }

    await _loadRoute();
  }

  bool _isPair(String? a, String? b, String x, String y) {
    return (a == x && b == y) || (a == y && b == x);
  }

  String _pricingZoneId(String coverageId) =>
      coverageId == 'airport-jjd' ? 'external' : coverageId;

  int _minimumPassengersFor(ServiceType service) =>
      service == ServiceType.buggy
          ? (_pricingPolicy?.buggyMinPassengers ?? 1)
          : 1;

  int _maximumPassengersFor(ServiceType service) =>
      service == ServiceType.buggy
          ? (_pricingPolicy?.buggyMaxPassengers ?? 4)
          : 1;

  Future<void> _loadPricingPolicy() async {
    final service = _pricingPolicyService;
    if (service == null) return;
    try {
      final policy = await service.load();
      if (!mounted) return;
      setState(() => _pricingPolicy = policy);
    } catch (_) {
      // O Core ainda valida toda cotação. Falha nesta visão pública não
      // libera preço inválido e não bloqueia o app offline/preview.
    }
  }

  List<ServiceType> _servicesForCoverage(ServiceAreaCheck coverage) {
    final origin = coverage.originZone?.id;
    final destination = coverage.destinationZone?.id;

    if (origin == null || destination == null) {
      return const [];
    }

    final policy = _pricingPolicy;
    if (policy != null) {
      final originPolicyZone = _pricingZoneId(origin);
      final destinationPolicyZone = _pricingZoneId(destination);
      if (
        !policy.enabledZones.contains(originPolicyZone) ||
        !policy.enabledZones.contains(destinationPolicyZone)
      ) {
        return const [];
      }
    }

    List<ServiceType> services;
    if (origin == 'jericoacoara' && destination == 'jericoacoara') {
      services = const [
        ServiceType.buggy,
        ServiceType.delivery,
      ];
    } else if (_isPair(origin, destination, 'jericoacoara', 'prea')) {
      services = const [
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    } else if (
      _isPair(origin, destination, 'jericoacoara', 'jijoca') ||
      _isPair(origin, destination, 'jericoacoara', 'airport-jjd')
    ) {
      services = const [ServiceType.comfortBlack];
    } else if (origin == 'prea' && destination == 'prea') {
      services = const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    } else if (origin == 'jijoca' && destination == 'jijoca') {
      services = const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
      ];
    } else if (
      _isPair(origin, destination, 'prea', 'jijoca') ||
      _isPair(origin, destination, 'prea', 'airport-jjd') ||
      _isPair(origin, destination, 'prea', 'external')
    ) {
      services = const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    } else {
      services = const [];
    }

    if (policy == null) return services;

    final sameLocalZone =
        origin == destination &&
        (origin == 'prea' || origin == 'jijoca');
    final originLocality =
        coverage.originZone?.localityId?.trim();
    final destinationLocality =
        coverage.destinationZone?.localityId?.trim();

    bool localityAllows(ServiceType service) {
      if (!sameLocalZone) return true;
      final originAllowed =
          originLocality == null || originLocality.isEmpty
              ? null
              : policy.localityCategories(
                  zoneId: origin,
                  localityId: originLocality,
                );
      final destinationAllowed =
          destinationLocality == null ||
                  destinationLocality.isEmpty
              ? null
              : policy.localityCategories(
                  zoneId: destination,
                  localityId: destinationLocality,
                );
      return (originAllowed == null ||
              originAllowed.contains(service.backendKey)) &&
          (destinationAllowed == null ||
              destinationAllowed.contains(service.backendKey));
    }

    return services
        .where(
          (service) =>
              policy.enabledCategories.contains(service.backendKey) &&
              localityAllows(service),
        )
        .toList(growable: false);
  }

  ServiceType _suggestService(List<ServiceType> available) {
    return available.first;
  }

  Future<void> _loadRoute() async {
    final origin = _origin;
    final destination = _destination;

    if (origin == null || destination == null) {
      return;
    }

    await _loadPricingPolicy();

    final coverage = RamoServiceArea.checkPlaceTrip(
      origin: origin,
      destination: destination,
    );

    if (!coverage.isSupported) {
      _routeRequestId++;
      setState(() {
        _route = null;
        _routeLoading = false;
        _coverageMessage = coverage.message;
        _serviceAreaLabel = null;
      });
      return;
    }

    if (_servicesForCoverage(coverage).isEmpty) {
      _routeRequestId++;
      setState(() {
        _route = null;
        _routeLoading = false;
        _coverageMessage = 'Essa rota ainda não tem serviço configurado.';
        _serviceAreaLabel = null;
      });
      return;
    }

    final requestId = ++_routeRequestId;
    setState(() {
      _routeLoading = true;
      _coverageMessage = null;
      _serviceAreaLabel =
          '${coverage.originZone!.label} → ${coverage.destinationZone!.label}';
    });

    try {
      final route = await _routeService.route(
        origin: origin.position,
        destination: destination.position,
      );

      if (!mounted || requestId != _routeRequestId) {
        return;
      }

      setState(() {
        _route = route;
        _routeLoading = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        _fitRoute();
      });
    } catch (_) {
      if (!mounted || requestId != _routeRequestId) {
        return;
      }

      setState(() {
        _route = null;
        _routeLoading = false;
      });
      _showMessage('Não conseguimos calcular essa rota agora.');
    }
  }

  void _fitRoute() {
    final origin = _origin;
    final destination = _destination;
    final route = _route;

    if (!_mapReady || origin == null || destination == null || route == null) {
      return;
    }

    unawaited(
      _mapController.fitCoordinates(
        coordinates: [
          origin.position,
          ...route.points,
          destination.position,
        ],
        padding: const EdgeInsets.fromLTRB(34, 130, 34, 390),
        maxZoom: 16,
      ),
    );
  }

  Future<void> _continueToVehicleSelection() async {
    final origin = _origin;
    final destination = _destination;
    final route = _route;

    if (origin == null) {
      await _chooseOrigin();
      return;
    }
    if (destination == null) {
      await _chooseDestination();
      return;
    }
    if (route == null) {
      await _loadRoute();
      return;
    }

    final coverage = RamoServiceArea.checkPlaceTrip(
      origin: origin,
      destination: destination,
    );
    if (!coverage.isSupported ||
        coverage.originZone == null ||
        coverage.destinationZone == null) {
      _showMessage(coverage.message ?? 'Essa rota ainda não é atendida.');
      return;
    }

    final originZoneId = coverage.originZone!.id;
    final destinationZoneId = coverage.destinationZone!.id;
    if (
      originZoneId == 'external' &&
      origin.approvedExternalId != 'airport-jjd' &&
      origin.placeProof?.trim().isNotEmpty != true
    ) {
      _showMessage(
        'Selecione novamente o local de partida externo para validar a localidade.',
      );
      return;
    }
    if (
      destinationZoneId == 'external' &&
      destination.approvedExternalId != 'airport-jjd' &&
      destination.placeProof?.trim().isNotEmpty != true
    ) {
      _showMessage(
        'Selecione novamente o destino externo para validar a localidade.',
      );
      return;
    }

    final services = _servicesForCoverage(coverage);
    if (services.isEmpty) {
      _showMessage('Essa rota ainda não tem serviço configurado.');
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VehicleSelectionScreen(
          originLabel: origin.displayName,
          destinationLabel: destination.displayName,
          routeSummary: '${route.distanceLabel} · ${route.durationLabel}',
          availableServices: services,
          initialService: _suggestService(services),
          buggyMinPassengers: _minimumPassengersFor(ServiceType.buggy),
          buggyMaxPassengers: _maximumPassengersFor(ServiceType.buggy),
          onContinue: (selection) => _prepareSelectedRide(
            selection: selection,
            coverage: coverage,
            origin: origin,
            destination: destination,
            route: route,
          ),
        ),
      ),
    );
  }

  Future<String?> _prepareSelectedRide({
    required VehicleSelectionResult selection,
    required ServiceAreaCheck coverage,
    required RamoPlace origin,
    required RamoPlace destination,
    required RouteInfo route,
  }) async {
    final preparation = _ridePreparationService;
    if (preparation == null) {
      return 'Não conseguimos iniciar esta corrida agora. Atualize o app ou tente novamente mais tarde.';
    }
    if (_preparingRide) {
      return 'Aguarde, estamos preparando sua corrida.';
    }

    if (!_servicesForCoverage(coverage).contains(selection.service)) {
      return 'Essa categoria não está disponível para esta rota.';
    }

    setState(() => _preparingRide = true);
    try {
      final prepared = await preparation.prepare(
        service: selection.service,
        origin: origin,
        destination: destination,
        originZoneId: coverage.originZone!.id,
        destinationZoneId: coverage.destinationZone!.id,
        route: route,
        passengers: selection.passengerCount,
      );

      if (!mounted) {
        return 'Não conseguimos abrir o pagamento agora.';
      }

      unawaited(
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => RidePaymentScreen(
              ride: prepared,
              paymentService: _paymentService,
              rideTrackingService: _rideTrackingService,
              rideRealtimeService: _rideRealtimeService,
              routeService: _routeService,
              networkTilesEnabled: widget.networkTilesEnabled,
            ),
          ),
        ),
      );
      return null;
    } on RidePreparationException catch (error) {
      return error.message;
    } catch (_) {
      return 'Não conseguimos preparar essa corrida agora.';
    } finally {
      if (mounted) setState(() => _preparingRide = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(message)),
      );
  }

  @override
  Widget build(BuildContext context) {
    final routeSummary = _route == null
        ? null
        : '${_route!.distanceLabel} · ${_route!.durationLabel}';

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RamoLiveMap(
              controller: _mapController,
              origin: _origin,
              destination: _destination,
              routePoints: _route?.points ?? const [],
              networkTilesEnabled: widget.networkTilesEnabled,
              onMapReady: () {
                _mapReady = true;

                final origin = _origin;
                if (origin != null) {
                  unawaited(_mapController.move(origin.position, 16));
                }
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(RamoSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _MapFloatingButton(
                        tooltip: 'Perfil',
                        onPressed: widget.onOpenProfile,
                        icon: const Icon(Icons.person_rounded),
                      ),
                      const Spacer(),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(RamoRadius.pill),
                          boxShadow: RamoElevation.floating(context),
                        ),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: RamoSpacing.md,
                            vertical: 11,
                          ),
                          child: RamoBrandLockup(compact: true),
                        ),
                      ),
                      const Spacer(),
                      _MapFloatingButton(
                        tooltip: 'Usar minha localização',
                        onPressed: _locating ? null : () => _locateUser(),
                        icon: _locating
                            ? const SizedBox.square(
                                dimension: 19,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.my_location_rounded),
                      ),
                    ],
                  ),
                  if (_agencyPromotion?.enabled == true) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Material(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius:
                          BorderRadius.circular(RamoRadius.pill),
                      elevation: 2,
                      child: InkWell(
                        key: const Key(
                          'passenger-agency-promotion',
                        ),
                        borderRadius:
                            BorderRadius.circular(RamoRadius.pill),
                        onTap: _openAgencyPromotion,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: RamoSpacing.md,
                            vertical: RamoSpacing.sm,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.explore_rounded,
                                size: 18,
                              ),
                              const SizedBox(width: RamoSpacing.xs),
                              Text(
                                _agencyPromotion!.subtitle,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          RideBottomSheet(
            origin: _origin?.displayName,
            destination: _destination?.displayName,
            routeSummary: routeSummary,
            serviceAreaLabel: _serviceAreaLabel,
            coverageMessage: _coverageMessage,
            routeLoading: _routeLoading,
            onOriginTap: _chooseOrigin,
            onDestinationTap: _chooseDestination,
            onDestinationClear:
                _destination == null ? null : _clearDestination,
            onContinue: _preparingRide
                ? () {}
                : () => unawaited(_continueToVehicleSelection()),
          ),
        ],
      ),
    );
  }
}


class _MapFloatingButton extends StatelessWidget {
  const _MapFloatingButton({
    required this.tooltip,
    required this.onPressed,
    required this.icon,
  });

  final String tooltip;
  final VoidCallback? onPressed;
  final Widget icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 0,
      shadowColor: Colors.black12,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: Tooltip(
          message: tooltip,
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: RamoElevation.floating(context),
            ),
            child: IconTheme(
              data: const IconThemeData(
                color: RamoColors.brandBlack,
                size: 23,
              ),
              child: icon,
            ),
          ),
        ),
      ),
    );
  }
}


class _UnavailableRouteService implements RouteService {
  const _UnavailableRouteService();

  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) {
    return Future<RouteInfo>.error(
      StateError(
        'Não conseguimos acessar o serviço de rotas agora.',
      ),
    );
  }
}

class _UnavailablePlaceSearchService implements PlaceSearchService {
  const _UnavailablePlaceSearchService();

  @override
  Future<List<RamoPlace>> search(String query) {
    return Future<List<RamoPlace>>.error(
      StateError(
        'Não conseguimos acessar a busca de destinos agora.',
      ),
    );
  }
}
