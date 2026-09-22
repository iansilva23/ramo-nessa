import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_map_config.dart';
import '../../../core/location/geolocator_location_service.dart';
import '../../../core/location/location_service.dart';
import '../../map/data/nominatim_place_search_service.dart';
import '../../map/data/osrm_route_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/data/route_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/domain/fare_calculator.dart';
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
    this.networkTilesEnabled = true,
  });

  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
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

  ServiceType _service = ServiceType.car;
  RamoPlace? _origin;
  RamoPlace? _destination;
  RouteInfo? _route;
  String? _coverageMessage;
  String? _serviceAreaLabel;
  bool _mapReady = false;
  bool _locating = false;
  bool _routeLoading = false;
  int _routeRequestId = 0;

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
    });

    if (_origin == null) {
      await _locateUser();
      return;
    }

    await _loadRoute();
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
        '${coverage.message} Atendemos Jeri, Jijoca e Preá.',
      );
      return;
    }

    if (_route == null) {
      _loadRoute();
      return;
    }

    if (!RamoMapConfig.matchingEnabled) {
      _showMessage(
        'Mapa, origem, zonas, rota e preço já estão ativos. O matching com '
        'motoristas será conectado na próxima etapa.',
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

    final coverage = _origin == null || _destination == null
        ? null
        : RamoServiceArea.checkTrip(
            origin: _origin!.position,
            destination: _destination!.position,
          );

    final estimatedFare = _route == null
        ? null
        : FareCalculator.estimate(
            service: _service,
            route: _route!,
            originZoneId: coverage?.originZone?.id,
            destinationZoneId: coverage?.destinationZone?.id,
          ).formatted;

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
            estimatedFare: estimatedFare,
            serviceAreaLabel: _serviceAreaLabel,
            coverageMessage: _coverageMessage,
            routeLoading: _routeLoading,
            onOriginTap: _chooseOrigin,
            onDestinationTap: _chooseDestination,
            onServiceChanged: (service) {
              setState(() => _service = service);
            },
            onRequestRide: _requestRide,
          ),
        ],
      ),
    );
  }
}
