import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../../core/config/ramo_map_config.dart';
import '../../../core/location/geolocator_location_service.dart';
import '../../../core/location/location_service.dart';
import '../../map/data/nominatim_place_search_service.dart';
import '../../map/data/osrm_route_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/data/route_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/data/http_pricing_quote_service.dart';
import '../../pricing/data/pricing_quote_service.dart';
import '../../pricing/domain/pricing_quote.dart';
import '../../service_area/domain/service_area_policy.dart';
import '../domain/service_type.dart';
import 'destination_search_screen.dart';
import 'finding_driver_screen.dart';
import 'widgets/ramo_live_map.dart';
import 'widgets/ride_bottom_sheet.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({
    super.key,
    this.locationService,
    this.routeService,
    this.placeSearchService,
    this.pricingQuoteService,
    this.networkTilesEnabled = true,
  });

  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final PricingQuoteService? pricingQuoteService;
  final bool networkTilesEnabled;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  final MapController _mapController = MapController();

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
                  baseUrl: Uri.parse(RamoCoreConfig.baseUrl),
                )
              : null);

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
  int _routeRequestId = 0;
  int _pricingRequestId = 0;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _locateUser(showErrors: false);
    });
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
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

  ServiceType _suggestService(ServiceAreaCheck coverage) {
    final origin = coverage.originZone?.id;
    final destination = coverage.destinationZone?.id;

    if (origin == 'jericoacoara' && destination == 'jericoacoara') {
      return ServiceType.buggy;
    }

    final jeriRoute =
        origin == 'jericoacoara' || destination == 'jericoacoara';
    if (jeriRoute) {
      return ServiceType.comfortBlack;
    }

    return _service;
  }

  Future<void> _loadRoute() async {
    final origin = _origin;
    final destination = _destination;

    if (origin == null || destination == null) {
      return;
    }

    final coverage = RamoServiceArea.checkTrip(
      origin: origin.position,
      destination: destination.position,
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

    final requestId = ++_routeRequestId;
    final suggestedService = _suggestService(coverage);

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
      _resetPricing();
    });

    final origin = _origin;
    final destination = _destination;
    final route = _route;
    if (origin == null || destination == null || route == null) {
      return;
    }

    final coverage = RamoServiceArea.checkTrip(
      origin: origin.position,
      destination: destination.position,
    );
    if (!coverage.isSupported) {
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

  void _requestRide() {
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

    final coverage = RamoServiceArea.checkTrip(
      origin: origin.position,
      destination: destination.position,
    );
    if (!coverage.isSupported) {
      _showMessage(
        '${coverage.message} Atendemos Jeri, Jijoca, Preá e Aeroporto JJD.',
      );
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

    if (!RamoMapConfig.matchingEnabled) {
      _showMessage(
        'Rota e preço do Core já estão conectados. O matching real será '
        'ativado junto do fluxo de pagamento confirmado.',
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => FindingDriverScreen(
          service: _service,
          destination: destination.displayName,
        ),
      ),
    );
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
                  _mapController.move(origin.position, 16);
                }
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(RamoSpacing.md),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(RamoRadius.pill),
                      boxShadow: RamoElevation.floating(context),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: RamoSpacing.md,
                        vertical: RamoSpacing.sm,
                      ),
                      child: RamoBrandLockup(compact: true),
                    ),
                  ),
                  const Spacer(),
                  IconButton.filledTonal(
                    tooltip: 'Usar minha localização',
                    onPressed: _locating ? null : () => _locateUser(),
                    icon: _locating
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location_rounded),
                  ),
                  const SizedBox(width: RamoSpacing.xs),
                  IconButton.filled(
                    tooltip: 'Perfil',
                    onPressed: () {},
                    icon: const Icon(Icons.person_rounded),
                  ),
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
            onServiceChanged: _reloadQuoteForService,
            onRequestRide: _requestRide,
          ),
        ],
      ),
    );
  }
}
