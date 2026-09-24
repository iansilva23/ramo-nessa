import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../../core/location/geolocator_location_service.dart';
import '../../../core/location/location_service.dart';
import '../../../core/communications/app_release_policy_service.dart';
import '../../../core/communications/agency_promotion_service.dart';
import '../../account/data/passenger_self_service.dart';
import '../../account/domain/passenger_account_models.dart';
import '../../map/data/nominatim_place_search_service.dart';
import '../../map/data/osrm_route_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/data/route_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/data/http_pricing_quote_service.dart';
import '../../pricing/data/pricing_quote_service.dart';
import '../../pricing/domain/pricing_quote.dart';
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
    this.pricingQuoteService,
    this.ridePreparationService,
    this.paymentService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.releasePolicyService,
    this.agencyPromotionService,
    this.selfService,
    this.networkTilesEnabled = true,
  });

  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final VoidCallback? onOpenProfile;
  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PricingQuoteService? pricingQuoteService;
  final RidePreparationService? ridePreparationService;
  final PassengerPaymentService? paymentService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final AppReleasePolicyService? releasePolicyService;
  final AgencyPromotionService? agencyPromotionService;
  final PassengerSelfService? selfService;
  final bool networkTilesEnabled;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  final MapController _mapController = MapController();

  late final String _accessToken = widget.accessToken?.trim() ?? '';
  late final bool _authenticated =
      RamoCoreConfig.enabled &&
      (_accessToken.length >= 20 ||
          RamoCoreConfig.devPassengerIdentityEnabled);

  late final LocationService _locationService =
      widget.locationService ?? GeolocatorLocationService();
  late final RouteService _routeService =
      widget.routeService ?? OsrmRouteService();
  late final PlaceSearchService _placeSearchService =
      widget.placeSearchService ?? NominatimPlaceSearchService();
  late final PricingQuoteService? _pricingQuoteService =
      widget.pricingQuoteService ??
          (RamoCoreConfig.enabled
              ? HttpPricingQuoteService(
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

  late final PassengerSelfService? _selfService =
      widget.selfService ??
          (_authenticated && _accessToken.length >= 20
              ? HttpPassengerSelfService(
                  baseUrl: RamoCoreConfig.baseUri!,
                  accessToken: _accessToken,
                )
              : null);

  int _selectedTab = 0;
  PassengerAccountSnapshot? _account;
  PassengerActivitySnapshot? _activity;
  bool _selfLoading = false;

  ServiceType _service = ServiceType.car;
  RamoPlace? _origin;
  RamoPlace? _destination;
  RouteInfo? _route;
  PricingQuote? _pricingQuote;
  String? _pricingMessage;
  String? _coverageMessage;
  String? _serviceAreaLabel;
  bool _mapReady = false;
  bool _locating = false;
  bool _routeLoading = false;
  bool _pricingLoading = false;
  bool _preparingRide = false;
  int _routeRequestId = 0;
  int _pricingRequestId = 0;
  int _passengerCount = 1;
  AgencyPromotion? _agencyPromotion;
  bool _releaseDialogShown = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _locateUser(showErrors: false);
      _loadCommunicationContent();
      _loadSelfData();
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

  Future<void> _showReleasePolicy(
    AppReleasePolicy policy,
  ) {
    return showDialog<void>(
      context: context,
      barrierDismissible: !policy.updateRequired,
      builder: (context) => AlertDialog(
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
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            if (policy.storeUrl != null) ...[
              const SizedBox(height: 10),
              const Text('Abra a loja do seu celular pelo endereço:'),
              const SizedBox(height: 4),
              SelectableText(policy.storeUrl!),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              policy.updateRequired ? 'Atualizar agora' : 'Entendi',
            ),
          ),
        ],
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

  void _resetPricing() {
    _pricingRequestId++;
    _pricingQuote = null;
    _pricingMessage = null;
    _pricingLoading = false;
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

      final origin = RamoPlace(
        name: 'Minha localização',
        address: 'Localização atual do aparelho',
        position: location,
      );

      setState(() {
        _origin = origin;
        _locating = false;
        _coverageMessage = null;
        _serviceAreaLabel = null;
        _resetPricing();
      });

      if (_mapReady) {
        _mapController.move(location, 16);
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
  }) {
    return Navigator.of(context).push<RamoPlace>(
      MaterialPageRoute(
        builder: (_) => DestinationSearchScreen(
          searchService: _placeSearchService,
          title: title,
          emptyTitle: emptyTitle,
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
      _resetPricing();
    });

    if (_destination != null) {
      await _loadRoute();
    } else if (_mapReady) {
      _mapController.move(origin.position, 16);
    }
  }

  Future<void> _chooseDestination() async {
    final destination = await _searchPlace(
      title: 'Escolher destino',
      emptyTitle: 'Busque seu destino',
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
      _resetPricing();
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

  List<ServiceType> _servicesForCoverage(ServiceAreaCheck coverage) {
    final origin = coverage.originZone?.id;
    final destination = coverage.destinationZone?.id;

    if (origin == null || destination == null) {
      return const [];
    }

    if (origin == 'jericoacoara' && destination == 'jericoacoara') {
      return const [
        ServiceType.buggy,
        ServiceType.delivery,
      ];
    }

    if (_isPair(origin, destination, 'jericoacoara', 'prea')) {
      return const [
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    }

    if (_isPair(origin, destination, 'jericoacoara', 'jijoca') ||
        _isPair(origin, destination, 'jericoacoara', 'airport-jjd')) {
      return const [ServiceType.comfortBlack];
    }

    if (origin == 'prea' && destination == 'prea') {
      return const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    }

    if (origin == 'jijoca' && destination == 'jijoca') {
      return const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
      ];
    }

    if (_isPair(origin, destination, 'prea', 'jijoca') ||
        _isPair(origin, destination, 'prea', 'airport-jjd') ||
        _isPair(origin, destination, 'prea', 'external')) {
      return const [
        ServiceType.car,
        ServiceType.moto,
        ServiceType.delivery,
        ServiceType.comfortBlack,
      ];
    }

    return const [];
  }

  ServiceType _suggestService(List<ServiceType> available) {
    if (available.contains(_service)) {
      return _service;
    }

    if (available.contains(ServiceType.comfortBlack)) {
      return ServiceType.comfortBlack;
    }

    if (available.contains(ServiceType.buggy)) {
      return ServiceType.buggy;
    }

    return available.first;
  }

  Future<void> _loadRoute() async {
    final origin = _origin;
    final destination = _destination;

    if (origin == null || destination == null) {
      return;
    }

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
        _resetPricing();
      });
      return;
    }

    final availableServices = _servicesForCoverage(coverage);
    if (availableServices.isEmpty) {
      _routeRequestId++;
      setState(() {
        _route = null;
        _routeLoading = false;
        _coverageMessage = 'Essa rota ainda não tem serviço configurado.';
        _serviceAreaLabel = null;
        _resetPricing();
      });
      return;
    }

    final requestId = ++_routeRequestId;
    final suggestedService = _suggestService(availableServices);

    setState(() {
      _service = suggestedService;
      _routeLoading = true;
      _coverageMessage = null;
      _serviceAreaLabel =
          '${coverage.originZone!.label} → ${coverage.destinationZone!.label}';
      _resetPricing();
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

      await _loadQuote(route: route, coverage: coverage);

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
        _resetPricing();
      });
      _showMessage('Não conseguimos calcular essa rota agora.');
    }
  }

  Future<void> _loadQuote({
    required RouteInfo route,
    required ServiceAreaCheck coverage,
  }) async {
    final origin = _origin;
    final destination = _destination;
    final service = _pricingQuoteService;

    if (origin == null ||
        destination == null ||
        coverage.originZone == null ||
        coverage.destinationZone == null) {
      return;
    }

    if (service == null) {
      setState(() {
        _pricingQuote = null;
        _pricingLoading = false;
        _pricingMessage =
            'Core não configurado neste build. Nenhum preço local será inventado.';
      });
      return;
    }

    final requestId = ++_pricingRequestId;
    setState(() {
      _pricingLoading = true;
      _pricingQuote = null;
      _pricingMessage = null;
    });

    try {
      final quote = await service.quote(
        service: _service,
        origin: origin,
        destination: destination,
        originZoneId: coverage.originZone!.id,
        destinationZoneId: coverage.destinationZone!.id,
        route: route,
        passengers: _passengerCount,
      );

      if (!mounted || requestId != _pricingRequestId) {
        return;
      }

      setState(() {
        _pricingQuote = quote;
        _pricingLoading = false;
        _pricingMessage = quote.isExact
            ? null
            : 'Essa tarifa ainda é uma faixa e precisa ser resolvida antes do pagamento.';
      });
    } on PricingQuoteException catch (error) {
      if (!mounted || requestId != _pricingRequestId) {
        return;
      }

      setState(() {
        _pricingQuote = null;
        _pricingLoading = false;
        _pricingMessage = error.message;
      });
    } catch (_) {
      if (!mounted || requestId != _pricingRequestId) {
        return;
      }

      setState(() {
        _pricingQuote = null;
        _pricingLoading = false;
        _pricingMessage = 'Não conseguimos obter a cotação do Core agora.';
      });
    }
  }

  Future<void> _reloadQuoteForService(ServiceType service) async {
    setState(() {
      _service = service;
      _passengerCount = 1;
      _resetPricing();
    });

    final origin = _origin;
    final destination = _destination;
    final route = _route;
    if (origin == null || destination == null || route == null) {
      return;
    }

    final coverage = RamoServiceArea.checkPlaceTrip(
      origin: origin,
      destination: destination,
    );
    if (!coverage.isSupported ||
        !_servicesForCoverage(coverage).contains(service)) {
      return;
    }

    await _loadQuote(route: route, coverage: coverage);
  }

  Future<void> _changePassengerCount(int count) async {
    if (count < 1 || count > 4 || count == _passengerCount) {
      return;
    }

    setState(() {
      _passengerCount = count;
      _resetPricing();
    });

    final origin = _origin;
    final destination = _destination;
    final route = _route;
    if (origin == null || destination == null || route == null) {
      return;
    }

    final coverage = RamoServiceArea.checkPlaceTrip(
      origin: origin,
      destination: destination,
    );
    if (!coverage.isSupported ||
        !_servicesForCoverage(coverage).contains(ServiceType.buggy)) {
      return;
    }

    await _loadQuote(route: route, coverage: coverage);
  }

  void _fitRoute() {
    final origin = _origin;
    final destination = _destination;
    final route = _route;

    if (!_mapReady || origin == null || destination == null || route == null) {
      return;
    }

    _mapController.fitCamera(
      CameraFit.coordinates(
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

  Future<void> _requestRide() async {
    final origin = _origin;
    final destination = _destination;

    if (origin == null) {
      _chooseOrigin();
      return;
    }

    if (destination == null) {
      _chooseDestination();
      return;
    }

    final coverage = RamoServiceArea.checkPlaceTrip(
      origin: origin,
      destination: destination,
    );
    if (!coverage.isSupported) {
      _showMessage(coverage.message ?? 'Essa rota ainda não é atendida.');
      return;
    }

    if (_route == null) {
      _loadRoute();
      return;
    }

    if (_pricingQuote == null || !_pricingQuote!.isExact) {
      _showMessage(
        _pricingMessage ?? 'Aguardando preço confirmado pelo Ramo Nessa Core.',
      );
      return;
    }

    final preparation = _ridePreparationService;
    if (preparation == null) {
      _showMessage(
        'Prepare RAMO_CORE_BASE_URL e RAMO_DEV_PASSENGER_ID para testar '
        'a criação real da corrida. Em produção isso será substituído '
        'pela autenticação do passageiro.',
      );
      return;
    }

    if (_preparingRide) return;

    setState(() => _preparingRide = true);
    try {
      final prepared = await preparation.prepare(
        service: _service,
        origin: origin,
        destination: destination,
        originZoneId: coverage.originZone!.id,
        destinationZoneId: coverage.destinationZone!.id,
        route: _route!,
        passengers: _passengerCount,
      );

      if (!mounted) return;

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => RidePaymentScreen(
            ride: prepared,
            paymentService: _paymentService,
            rideTrackingService: _rideTrackingService,
            rideRealtimeService: _rideRealtimeService,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on RidePreparationException catch (error) {
      if (mounted) _showMessage(error.message);
    } catch (_) {
      if (mounted) {
        _showMessage('Não conseguimos preparar essa corrida agora.');
      }
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

  Future<void> _loadSelfData() async {
    final service = _selfService;
    if (service == null || _selfLoading) return;
    if (mounted) setState(() => _selfLoading = true);
    try {
      final results = await Future.wait<Object>([
        service.account(),
        service.activity(),
      ]);
      if (!mounted) return;
      setState(() {
        _account = results[0] as PassengerAccountSnapshot;
        _activity = results[1] as PassengerActivitySnapshot;
        _selfLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _selfLoading = false);
    }
  }

  Future<void> _logoutAccount() async {
    final logout = widget.onLogout;
    if (logout == null) return;
    final success = await logout();
    if (!mounted || success) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Não foi possível encerrar a sessão agora. Tente novamente.',
        ),
      ),
    );
  }

  Widget _buildActivityTab() {
    final activity = _activity;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _loadSelfData,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            Text(
              'Atividade',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Suas corridas ficam organizadas aqui.',
              style: TextStyle(color: RamoColors.muted),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (_selfLoading && activity == null)
              const Center(child: CircularProgressIndicator())
            else if (activity == null)
              const _PassengerEmptyState(
                icon: Icons.history_rounded,
                title: 'Histórico indisponível',
                subtitle: 'Puxe para baixo para tentar novamente.',
              )
            else ...[
              _PassengerActivitySummary(activity: activity),
              const SizedBox(height: RamoSpacing.lg),
              if (activity.rides.isEmpty)
                const _PassengerEmptyState(
                  icon: Icons.route_rounded,
                  title: 'Nenhuma corrida ainda',
                  subtitle: 'Suas próximas viagens aparecerão aqui.',
                )
              else
                ...activity.rides.map(
                  (ride) => Padding(
                    padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
                    child: _PassengerRideHistoryCard(ride: ride),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildProfileTab() {
    final account = _account;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _loadSelfData,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            Text(
              'Perfil',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            _PassengerProfileHero(
              account: account,
              loading: _selfLoading && account == null,
            ),
            const SizedBox(height: RamoSpacing.lg),
            _PassengerProfileOption(
              icon: Icons.badge_outlined,
              title: 'Dados pessoais',
              subtitle: account?.email ?? 'Nome, celular e e-mail',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        _PassengerPersonalDataScreen(account: account),
                  ),
                );
              },
            ),
            _PassengerProfileOption(
              icon: Icons.receipt_long_rounded,
              title: 'Histórico de corridas',
              subtitle: _activity == null
                  ? 'Consultar atividade'
                  : '${_activity!.completed} concluídas',
              onTap: () => setState(() => _selectedTab = 1),
            ),
            _PassengerProfileOption(
              icon: Icons.credit_card_rounded,
              title: 'Formas de pagamento',
              subtitle: 'Pix, cartão, carteira e dinheiro quando habilitado',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const _PassengerPaymentMethodsScreen(),
                  ),
                );
              },
            ),
            _PassengerProfileOption(
              icon: Icons.security_rounded,
              title: 'Segurança',
              subtitle: 'Sessão protegida neste aparelho',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const _PassengerSecurityScreen(),
                  ),
                );
              },
            ),
            if (widget.onLogout != null)
              _PassengerProfileOption(
                key: const Key('passenger-logout'),
                icon: Icons.logout_rounded,
                title: 'Sair',
                subtitle: 'Encerrar a sessão neste aparelho',
                onTap: _logoutAccount,
                destructive: true,
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final coverage = _origin != null && _destination != null
        ? RamoServiceArea.checkPlaceTrip(
            origin: _origin!,
            destination: _destination!,
          )
        : null;
    final availableServices = coverage == null
        ? const [
            ServiceType.car,
            ServiceType.moto,
            ServiceType.delivery,
          ]
        : _servicesForCoverage(coverage);

    final routeSummary = _route == null
        ? null
        : '${_route!.distanceLabel} · ${_route!.durationLabel}';

    final homeMap = Stack(
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
                  _mapController.move(origin.position, 16);
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
                        onPressed: () => setState(() => _selectedTab = 2),
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
            selectedService: _service,
            origin: _origin?.displayName,
            destination: _destination?.displayName,
            routeSummary: routeSummary,
            estimatedFare: _pricingQuote?.formatted,
            fareCaption: _pricingQuote?.isExact == true
                ? 'preço confirmado pelo Core'
                : 'cotação do Ramo Nessa Core',
            priceIsFinal: _pricingQuote?.isExact == true,
            pricingMessage: _pricingMessage,
            pricingLoading: _pricingLoading,
            serviceAreaLabel: _serviceAreaLabel,
            coverageMessage: _coverageMessage,
            routeLoading: _routeLoading,
            onOriginTap: _chooseOrigin,
            onDestinationTap: _chooseDestination,
            passengerCount: _passengerCount,
            onPassengerCountChanged: _changePassengerCount,
            availableServices: availableServices,
            onServiceChanged: _reloadQuoteForService,
            onRequestRide: _requestRide,
          ),
      ],
    );

    return Scaffold(
      body: IndexedStack(
        index: _selectedTab,
        children: [
          homeMap,
          _buildActivityTab(),
          _buildProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedTab,
        onDestinationSelected: (index) {
          setState(() => _selectedTab = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Início',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: 'Atividade',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}


String _passengerFormatCents(int cents) {
  final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
  return 'R\$ $value';
}

class _PassengerEmptyState extends StatelessWidget {
  const _PassengerEmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.xl),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        children: [
          Icon(icon, size: 38),
          const SizedBox(height: RamoSpacing.sm),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(color: RamoColors.muted),
          ),
        ],
      ),
    );
  }
}

class _PassengerActivitySummary extends StatelessWidget {
  const _PassengerActivitySummary({required this.activity});

  final PassengerActivitySnapshot activity;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Total', activity.total.toString()),
      ('Concluídas', activity.completed.toString()),
      ('Canceladas', activity.cancelled.toString()),
      ('Ativas', activity.active.toString()),
    ];
    final width =
        (MediaQuery.sizeOf(context).width -
            (RamoSpacing.lg * 2) -
            RamoSpacing.sm) /
        2;

    return Wrap(
      spacing: RamoSpacing.sm,
      runSpacing: RamoSpacing.sm,
      children: items
          .map(
            (item) => SizedBox(
              width: width,
              child: Container(
                padding: const EdgeInsets.all(RamoSpacing.md),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.$1,
                      style: const TextStyle(
                        color: RamoColors.muted,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.$2,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _PassengerRideHistoryCard extends StatelessWidget {
  const _PassengerRideHistoryCard({required this.ride});

  final PassengerActivityRide ride;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RamoColors.surfaceRaised,
      borderRadius: BorderRadius.circular(RamoRadius.md),
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.md),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: Colors.white,
              foregroundColor: RamoColors.brandBlack,
              child: Icon(
                ride.state == 'COMPLETED'
                    ? Icons.check_rounded
                    : ride.state.startsWith('CANCELLED_')
                        ? Icons.close_rounded
                        : Icons.route_rounded,
              ),
            ),
            const SizedBox(width: RamoSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${ride.originZoneId} → ${ride.destinationZoneId}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${ride.categoryLabel} · ${ride.stateLabel}',
                    style: const TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: RamoSpacing.sm),
            Text(
              _passengerFormatCents(ride.totalAmountCents),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _PassengerProfileHero extends StatelessWidget {
  const _PassengerProfileHero({
    required this.account,
    required this.loading,
  });

  final PassengerAccountSnapshot? account;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final account = this.account;
    final name = loading
        ? 'Carregando conta…'
        : account?.displayName ?? 'Passageiro Ramo Nessa';

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.brandBlack,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 32,
            backgroundColor: RamoColors.brandYellow,
            foregroundColor: RamoColors.brandBlack,
            child: Icon(Icons.person_rounded, size: 34),
          ),
          const SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 19,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  account?.phoneE164 ?? 'Conta protegida',
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PassengerProfileOption extends StatelessWidget {
  const _PassengerProfileOption({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(
          icon,
          color: destructive
              ? Theme.of(context).colorScheme.error
              : RamoColors.brandBlack,
        ),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: destructive ? Theme.of(context).colorScheme.error : null,
        ),
      ),
      subtitle: Text(subtitle),
      trailing: destructive
          ? null
          : const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _PassengerPersonalDataScreen extends StatelessWidget {
  const _PassengerPersonalDataScreen({required this.account});

  final PassengerAccountSnapshot? account;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dados pessoais')),
      body: ListView(
        padding: const EdgeInsets.all(RamoSpacing.lg),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Nome'),
            subtitle: Text(account?.fullName ?? 'Não informado'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Celular'),
            subtitle: Text(account?.phoneE164 ?? 'Não informado'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('E-mail'),
            subtitle: Text(account?.email ?? 'Não informado'),
          ),
        ],
      ),
    );
  }
}

class _PassengerPaymentMethodsScreen extends StatelessWidget {
  const _PassengerPaymentMethodsScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Formas de pagamento')),
      body: ListView(
        padding: const EdgeInsets.all(RamoSpacing.lg),
        children: const [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.pix_rounded),
            title: Text('Pix'),
            subtitle: Text('Disponível para corridas digitais.'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.credit_card_rounded),
            title: Text('Cartão'),
            subtitle: Text(
              'Tokenizado pelo Mercado Pago. O Ramo Nessa não recebe seu CVV.',
            ),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.account_balance_wallet_outlined),
            title: Text('Carteira Ramo Nessa'),
            subtitle: Text('Usa o saldo disponível da sua conta.'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.payments_outlined),
            title: Text('Dinheiro'),
            subtitle: Text('Só aparece quando a operação liberar pelo ADM.'),
          ),
        ],
      ),
    );
  }
}

class _PassengerSecurityScreen extends StatelessWidget {
  const _PassengerSecurityScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Segurança')),
      body: const ListView(
        padding: EdgeInsets.all(RamoSpacing.lg),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.lock_rounded),
            title: Text('Sessão segura'),
            subtitle: Text(
              'Sua sessão permanece protegida no armazenamento seguro do aparelho e pode ser revogada pelo Core.',
            ),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.sms_outlined),
            title: Text('Telefone verificado'),
            subtitle: Text(
              'O OTP continua sendo usado para confirmar e recuperar sua conta.',
            ),
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
