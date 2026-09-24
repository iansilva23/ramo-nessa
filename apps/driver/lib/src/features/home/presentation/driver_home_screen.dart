import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/driver_core_config.dart';
import '../../../core/location/device_driver_location_service.dart';
import '../../../core/location/driver_location_service.dart';
import '../../../core/navigation/driver_navigation_service.dart';
import '../../../core/navigation/external_driver_navigation_service.dart';
import '../../../core/communications/app_release_policy_service.dart';
import '../data/driver_api.dart';
import '../data/driver_realtime_service.dart';
import '../data/driver_route_service.dart';
import '../data/http_driver_api.dart';
import '../data/io_driver_realtime_service.dart';
import '../domain/driver_models.dart';
import '../domain/driver_route_info.dart';
import 'widgets/driver_live_map.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    this.accessToken,
    this.onLogout,
    this.api,
    this.locationService,
    this.navigationService,
    this.realtimeService,
    this.releasePolicyService,
  });

  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRealtimeService? realtimeService;
  final AppReleasePolicyService? releasePolicyService;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  late final String _accessToken = widget.accessToken?.trim() ?? '';
  late final bool _authenticated =
      DriverCoreConfig.enabled &&
      (_accessToken.length >= 20 ||
          DriverCoreConfig.devDriverIdentityEnabled);

  late final DriverApi? _api = widget.api ??
      (_authenticated
          ? HttpDriverApi(
              baseUrl: DriverCoreConfig.baseUri!,
              accessToken: _accessToken,
              driverId: DriverCoreConfig.devDriverId,
            )
          : null);

  late final DriverLocationService _location =
      widget.locationService ?? DeviceDriverLocationService();

  late final DriverNavigationService _navigation =
      widget.navigationService ?? ExternalDriverNavigationService();

  late final DriverRealtimeService? _realtimeService =
      widget.realtimeService ??
          (_authenticated
              ? IoDriverRealtimeService(
                  baseUrl: DriverCoreConfig.baseUri!,
                  accessToken: _accessToken,
                  driverId: DriverCoreConfig.devDriverId,
                )
              : null);

  late final AppReleasePolicyService? _releasePolicyService =
      widget.releasePolicyService ??
          (DriverCoreConfig.enabled
              ? HttpAppReleasePolicyService(
                  baseUrl: DriverCoreConfig.baseUri!,
                )
              : null);

  DriverSupplySnapshot? _supply;
  DriverOffer? _offer;
  AcceptedDriverRide? _activeRide;
  DriverFinanceSummary? _finance;
  DriverRouteInfo? _activeRoute;
  final MapController _mapController = MapController();
  bool _mapReady = false;
  DateTime? _lastRouteRefreshAt;
  int _selectedTab = 0;
  late final DriverRouteService? _routeService =
      widget.api != null && !DriverCoreConfig.previewMode
          ? null
          : OsrmDriverRouteService();
  bool _loading = true;
  bool _changingStatus = false;
  bool _offerAction = false;
  bool _rideAction = false;
  bool _financeLoading = false;
  bool _payoutAction = false;
  String? _pendingPayoutIdempotencyKey;
  int? _pendingPayoutAmountCents;
  String? _message;
  Timer? _pollTimer;
  Timer? _ticker;
  StreamSubscription<DriverPosition>? _locationSubscription;
  StreamSubscription<DriverRealtimeUpdate>? _realtimeSubscription;
  bool _locationSyncInFlight = false;
  bool _releaseDialogShown = false;

  @override
  void initState() {
    super.initState();
    _load();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkReleasePolicy();
    });
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

  Future<void> _checkReleasePolicy() async {
    final service = _releasePolicyService;
    final platform = _platformName;
    if (
      service == null ||
      platform == null ||
      _releaseDialogShown
    ) {
      return;
    }

    try {
      final policy = await service.check(
        appKind: 'driver',
        platform: platform,
        buildNumber: DriverCoreConfig.appBuild,
      );
      if (!mounted || !policy.updateAvailable) return;
      _releaseDialogShown = true;

      await showDialog<void>(
        context: context,
        barrierDismissible: !policy.updateRequired,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.system_update_alt_rounded),
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
                const Text('Abra a loja pelo endereço:'),
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
    } catch (_) {
      // Falha de consulta de versão não impede o motorista de operar.
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _ticker?.cancel();
    _locationSubscription?.cancel();
    _realtimeSubscription?.cancel();
    super.dispose();
  }

  Future<void> _applyLoadedSupply(
    DriverSupplySnapshot supply,
  ) async {
    if (!mounted) return;
    setState(() {
      _supply = supply;
      _loading = false;
      _message = null;
    });

    await _refreshFinance(showError: false);

    if (supply.online) {
      _startLocationTracking();
      _startRealtime();
    }

    if (supply.busy) {
      final ride = await _api?.currentRide();
      if (!mounted) return;
      setState(() => _activeRide = ride);
      await _refreshActiveRoute(force: true);
    } else if (supply.online) {
      _startPolling();
      await _refreshOffer();
    }
  }

  Future<void> _load() async {
    final api = _api;
    if (api == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message =
            'Configure RAMO_CORE_BASE_URL e RAMO_DEV_DRIVER_ID para testar.';
      });
      return;
    }

    try {
      final supply = await api.getSupply();
      await _applyLoadedSupply(supply);
    } on DriverApiException catch (error) {
      if (error.code == 'DRIVER_SUPPLY_NOT_INITIALIZED') {
        try {
          final position = await _location.currentPosition();
          final initialized = await api.updateSupply(
            online: false,
            position: position,
          );
          await _applyLoadedSupply(initialized);
          return;
        } on DriverLocationException catch (locationError) {
          if (!mounted) return;
          setState(() {
            _loading = false;
            _message = locationError.message;
          });
          return;
        } on DriverApiException catch (initializationError) {
          if (!mounted) return;
          setState(() {
            _loading = false;
            _message = initializationError.message;
          });
          return;
        }
      }

      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = 'Não conseguimos carregar o perfil do motorista.';
      });
    }
  }

  void _startLocationTracking() {
    if (_locationSubscription != null) return;

    _locationSubscription = _location.positionStream().listen(
      (position) => unawaited(_syncTrackedPosition(position)),
      onError: (Object error) {
        if (!mounted) return;
        setState(() {
          _message = error is DriverLocationException
              ? error.message
              : 'A localização automática foi interrompida.';
        });
      },
      onDone: () {
        _locationSubscription = null;
      },
    );
  }

  Future<void> _stopLocationTracking() async {
    final subscription = _locationSubscription;
    _locationSubscription = null;
    await subscription?.cancel();
  }

  Future<void> _syncTrackedPosition(DriverPosition position) async {
    final api = _api;
    final supply = _supply;
    if (
      api == null ||
      supply == null ||
      !supply.online ||
      _locationSyncInFlight
    ) {
      return;
    }

    _locationSyncInFlight = true;
    try {
      final updated = await api.updateSupply(position: position);
      if (!mounted) return;
      setState(() => _supply = updated);
      if (_mapReady) {
        _mapController.move(
          LatLng(updated.latitude, updated.longitude),
          _mapController.camera.zoom,
        );
      }
      if (_activeRide != null) {
        unawaited(_refreshActiveRoute());
      }
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _message = 'Localização automática: ${error.message}';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message =
            'Localização automática: não conseguimos sincronizar agora.';
      });
    } finally {
      _locationSyncInFlight = false;
    }
  }

  void _startRealtime() {
    final service = _realtimeService;
    if (service == null || _realtimeSubscription != null) return;

    _realtimeSubscription = service.watch().listen(
      (update) {
        if (!mounted) return;
        setState(() {
          if (update.offerUpdated) {
            _offer = update.offer;
          }
          if (update.rideUpdated) {
            _activeRide = update.ride;
          }
        });

        if (update.rideUpdated) {
          unawaited(_refreshActiveRoute(force: true));
        }

        if (update.ride != null) {
          _stopPolling();
        } else if (
          update.rideUpdated &&
          _supply?.online == true &&
          _supply?.busy == false
        ) {
          _startPolling();
        }
      },
      onError: (_) {
        // O polling HTTP continua ativo como fallback.
      },
      onDone: () {
        _realtimeSubscription = null;
      },
    );
  }

  Future<void> _stopRealtime() async {
    final subscription = _realtimeSubscription;
    _realtimeSubscription = null;
    await subscription?.cancel();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _ticker?.cancel();
    _pollTimer = Timer.periodic(
      DriverCoreConfig.offerPollingInterval,
      (_) => _refreshOffer(),
    );
    _ticker = Timer.periodic(
      const Duration(seconds: 1),
      (_) {
        if (mounted && _offer != null) setState(() {});
      },
    );
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _ticker?.cancel();
    _pollTimer = null;
    _ticker = null;
  }

  Future<void> _refreshOffer() async {
    final api = _api;
    final supply = _supply;
    if (
      api == null ||
      supply == null ||
      !supply.online ||
      supply.busy ||
      _offerAction
    ) {
      return;
    }

    try {
      final offer = await api.currentOffer();
      if (!mounted) return;
      setState(() => _offer = offer);
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() => _message = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _message = 'Não conseguimos atualizar as ofertas agora.');
    }
  }

  Future<void> _setOnline(bool online) async {
    final api = _api;
    final supply = _supply;
    if (api == null || supply == null || _changingStatus) return;

    setState(() {
      _changingStatus = true;
      _message = null;
    });

    try {
      DriverPosition? position;
      if (online) {
        position = await _location.currentPosition();
      }

      final updated = await api.updateSupply(
        online: online,
        position: position,
      );

      if (!mounted) return;
      setState(() {
        _supply = updated;
        _changingStatus = false;
        if (!online) _offer = null;
      });

      if (updated.online) {
        _startLocationTracking();
        _startRealtime();
      } else {
        await _stopLocationTracking();
        await _stopRealtime();
      }

      if (updated.online && !updated.busy) {
        _startPolling();
        await _refreshOffer();
      } else {
        _stopPolling();
      }
    } on DriverLocationException catch (error) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = error.message;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = 'Não foi possível alterar sua disponibilidade.';
      });
    }
  }

  Future<void> _updateLocation() async {
    final api = _api;
    if (api == null || _changingStatus) return;

    setState(() {
      _changingStatus = true;
      _message = null;
    });

    try {
      final position = await _location.currentPosition();
      final updated = await api.updateSupply(position: position);
      if (!mounted) return;
      setState(() {
        _supply = updated;
        _changingStatus = false;
      });
      await _refreshOffer();
    } on DriverLocationException catch (error) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = error.message;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _changingStatus = false;
        _message = 'Não conseguimos atualizar sua localização agora.';
      });
    }
  }

  Future<void> _acceptOffer() async {
    final api = _api;
    final offer = _offer;
    if (api == null || offer == null || _offerAction) return;

    setState(() => _offerAction = true);
    try {
      final ride = await api.acceptOffer(offer.id);
      final supply = await api.getSupply();
      if (!mounted) return;
      _stopPolling();
      setState(() {
        _activeRide = ride;
        _supply = supply;
        _offer = null;
        _offerAction = false;
        _message = null;
      });
      await _refreshActiveRoute(force: true);
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _offerAction = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _offerAction = false;
        _message = 'Não conseguimos aceitar a corrida agora.';
      });
    }
  }

  Future<void> _navigateActiveRide() async {
    final ride = _activeRide;
    if (ride == null) return;

    final useDropoff = ride.state == 'IN_PROGRESS';
    final latitude =
        useDropoff ? ride.dropoffLatitude : ride.pickupLatitude;
    final longitude =
        useDropoff ? ride.dropoffLongitude : ride.pickupLongitude;

    if (latitude == null || longitude == null) {
      if (!mounted) return;
      setState(() {
        _message = useDropoff
            ? 'O destino exato desta corrida não está disponível.'
            : 'O ponto de embarque desta corrida não está disponível.';
      });
      return;
    }

    try {
      await _navigation.openNavigation(
        latitude: latitude,
        longitude: longitude,
      );
    } on DriverNavigationException catch (error) {
      if (!mounted) return;
      setState(() => _message = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message = 'Não foi possível abrir a navegação agora.';
      });
    }
  }

  Future<void> _markArrived() async {
    final api = _api;
    final ride = _activeRide;
    if (api == null || ride == null || _rideAction) return;

    setState(() => _rideAction = true);
    try {
      final updated = await api.markArrived(ride.id);
      if (!mounted) return;
      setState(() {
        _activeRide = updated;
        _rideAction = false;
        _message = null;
      });
      await _refreshActiveRoute(force: true);
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = 'Não conseguimos marcar sua chegada agora.';
      });
    }
  }

  Future<void> _startRide() async {
    final api = _api;
    final ride = _activeRide;
    if (api == null || ride == null || _rideAction) return;

    setState(() => _rideAction = true);
    try {
      final updated = await api.startRide(ride.id);
      if (!mounted) return;
      setState(() {
        _activeRide = updated;
        _rideAction = false;
        _message = null;
      });
      await _refreshActiveRoute(force: true);
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = 'Não conseguimos iniciar a corrida agora.';
      });
    }
  }

  Future<void> _refreshFinance({bool showError = true}) async {
    final api = _api;
    if (api == null || _financeLoading) return;

    if (mounted) {
      setState(() => _financeLoading = true);
    } else {
      _financeLoading = true;
    }

    try {
      final finance = await api.financeSummary();
      if (!mounted) return;
      setState(() => _finance = finance);
    } on DriverApiException catch (error) {
      if (!mounted || !showError) return;
      setState(() => _message = error.message);
    } catch (_) {
      if (!mounted || !showError) return;
      setState(() => _message = 'Não conseguimos atualizar seus ganhos agora.');
    } finally {
      if (mounted) {
        setState(() => _financeLoading = false);
      } else {
        _financeLoading = false;
      }
    }
  }

  Future<void> _requestPayout() async {
    final api = _api;
    final finance = _finance;
    if (
      api == null ||
      finance == null ||
      finance.availableBalanceCents <= 0 ||
      _payoutAction
    ) {
      return;
    }

    final amount = _pendingPayoutAmountCents ?? finance.availableBalanceCents;
    final key = _pendingPayoutIdempotencyKey ??=
        'driver-payout-${DateTime.now().microsecondsSinceEpoch}';
    _pendingPayoutAmountCents ??= amount;

    setState(() => _payoutAction = true);
    try {
      final result = await api.requestPayout(
        amountCents: amount,
        idempotencyKey: key,
      );
      if (!mounted) return;

      setState(() {
        _finance = result.finance;
        _pendingPayoutIdempotencyKey = null;
        _pendingPayoutAmountCents = null;
        _message = null;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Saque solicitado: ${formatCents(result.amountCents)}. '
              'O valor ficou reservado para repasse.',
            ),
          ),
        );
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        // O servidor respondeu de forma definitiva. Uma nova tentativa pode
        // representar uma nova solicitação.
        _pendingPayoutIdempotencyKey = null;
        _pendingPayoutAmountCents = null;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        // Em falha de transporte o servidor pode ter processado a solicitação.
        // Mantemos a mesma chave/valor para o retry ser realmente idempotente.
        _message =
            'Não foi possível confirmar o saque. Tente novamente; '
            'não criaremos uma solicitação duplicada.';
      });
    } finally {
      if (mounted) {
        setState(() => _payoutAction = false);
      } else {
        _payoutAction = false;
      }
    }
  }

  Future<void> _completeRide() async {
    final api = _api;
    final ride = _activeRide;
    if (api == null || ride == null || _rideAction) return;

    setState(() => _rideAction = true);
    try {
      final result = await api.completeRide(ride.id);
      final supply = await api.getSupply();
      if (!mounted) return;

      setState(() {
        _activeRide = null;
        _activeRoute = null;
        _supply = supply;
        _rideAction = false;
        _message = null;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Corrida finalizada. Saldo disponível: '
              '${formatCents(result.driverBalanceCents)}',
            ),
          ),
        );

      await _refreshFinance(showError: false);

      if (supply.online && !supply.busy) {
        _startPolling();
        await _refreshOffer();
      }
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message =
            'Não conseguimos confirmar a finalização agora. '
            'Tente novamente com segurança.';
      });
    }
  }

  Future<void> _rejectOffer() async {
    final api = _api;
    final offer = _offer;
    if (api == null || offer == null || _offerAction) return;

    setState(() => _offerAction = true);
    try {
      await api.rejectOffer(offer.id);
      if (!mounted) return;
      setState(() {
        _offer = null;
        _offerAction = false;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _offerAction = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _offerAction = false;
        _message = 'Não conseguimos recusar a corrida agora.';
      });
    }
  }

  Future<void> _logout() async {
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

  Future<void> _refreshActiveRoute({bool force = false}) async {
    final service = _routeService;
    final supply = _supply;
    final ride = _activeRide;
    if (service == null || supply == null || ride == null) {
      if (mounted && _activeRoute != null) {
        setState(() => _activeRoute = null);
      }
      return;
    }

    final now = DateTime.now();
    if (!force &&
        _lastRouteRefreshAt != null &&
        now.difference(_lastRouteRefreshAt!) < const Duration(seconds: 20)) {
      return;
    }

    final useDropoff = ride.state == 'IN_PROGRESS';
    final latitude =
        useDropoff ? ride.dropoffLatitude : ride.pickupLatitude;
    final longitude =
        useDropoff ? ride.dropoffLongitude : ride.pickupLongitude;
    if (latitude == null || longitude == null) return;

    _lastRouteRefreshAt = now;
    try {
      final route = await service.route(
        origin: LatLng(supply.latitude, supply.longitude),
        destination: LatLng(latitude, longitude),
      );
      if (!mounted) return;
      setState(() => _activeRoute = route);
    } catch (_) {
      // A navegação externa continua disponível mesmo quando a rota
      // embutida não puder ser recalculada.
    }
  }

  void _centerDriverOnMap() {
    final supply = _supply;
    if (!_mapReady || supply == null) return;
    _mapController.move(
      LatLng(supply.latitude, supply.longitude),
      _mapController.camera.zoom,
    );
  }

  Widget _buildHomeMap(DriverSupplySnapshot supply) {
    final showOffer = _offer != null && _activeRide == null;

    return Stack(
      fit: StackFit.expand,
      children: [
        DriverLiveMap(
          controller: _mapController,
          supply: supply,
          activeRide: _activeRide,
          route: _activeRoute,
          networkTilesEnabled:
              widget.api == null || DriverCoreConfig.previewMode,
          onMapReady: () {
            _mapReady = true;
            _centerDriverOnMap();
          },
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Align(
              alignment: Alignment.topCenter,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _MapCircleButton(
                    tooltip: 'Perfil',
                    icon: Icons.person_rounded,
                    onPressed: () => setState(() => _selectedTab = 3),
                  ),
                  const Spacer(),
                  _EarningsPill(
                    amountCents: _finance?.availableBalanceCents ?? 0,
                    onTap: () => setState(() => _selectedTab = 1),
                  ),
                  const Spacer(),
                  _MapCircleButton(
                    tooltip: 'Centralizar mapa',
                    icon: Icons.my_location_rounded,
                    onPressed: _centerDriverOnMap,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_message != null)
          Positioned(
            top: 86,
            left: 16,
            right: 16,
            child: SafeArea(
              child: _CompactMapMessage(message: _message!),
            ),
          ),
        Positioned(
          left: 14,
          right: 14,
          bottom: 14,
          child: SafeArea(
            top: false,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, .08),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              ),
              child: showOffer
                  ? _OfferCard(
                      key: ValueKey('offer-${_offer!.id}'),
                      offer: _offer!,
                      busy: _offerAction,
                      onAccept: _acceptOffer,
                      onReject: _rejectOffer,
                    )
                  : _activeRide != null
                      ? _ActiveRideCard(
                          key: ValueKey(
                            'ride-${_activeRide!.id}-${_activeRide!.state}',
                          ),
                          ride: _activeRide!,
                          busy: _rideAction,
                          onNavigate: _navigateActiveRide,
                          onArrived: _markArrived,
                          onStart: _startRide,
                          onComplete: _completeRide,
                          route: _activeRoute,
                        )
                      : _MapAvailabilityPanel(
                          key: ValueKey('availability-${supply.online}'),
                          online: supply.online,
                          changing: _changingStatus,
                          onToggle: _setOnline,
                          onUpdateLocation: _updateLocation,
                        ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEarnings() {
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _refreshFinance,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            const _SectionHeader(
              eyebrow: 'CARTEIRA',
              title: 'Ganhos',
              subtitle: 'Saldo, repasses e extrato em um só lugar.',
            ),
            const SizedBox(height: RamoSpacing.lg),
            _DriverFinanceCard(
              finance: _finance,
              loading: _financeLoading,
              requesting: _payoutAction,
              onRefresh: _refreshFinance,
              onRequestPayout: _requestPayout,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActivity(DriverSupplySnapshot supply) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          const _SectionHeader(
            eyebrow: 'CORRIDAS',
            title: 'Atividade',
            subtitle: 'Sua operação atual fica separada da tela principal.',
          ),
          const SizedBox(height: RamoSpacing.lg),
          if (_activeRide != null)
            _ActiveRideCard(
              ride: _activeRide!,
              busy: _rideAction,
              onNavigate: _navigateActiveRide,
              onArrived: _markArrived,
              onStart: _startRide,
              onComplete: _completeRide,
              route: _activeRoute,
            )
          else
            _WaitingCard(
              icon: Icons.history_rounded,
              title: 'Nenhuma corrida ativa',
              subtitle: supply.online
                  ? 'Você está online e pronto para receber novas corridas.'
                  : 'Fique online pela tela Início quando quiser dirigir.',
            ),
        ],
      ),
    );
  }

  Widget _buildProfile(DriverSupplySnapshot supply) {
    final categories = supply.categories
        .map((category) => switch (category) {
              'moto' => 'Moto',
              'car' => 'Carro',
              'comfort_black' => 'Comfort / Black',
              'buggy' => 'Buggy',
              'delivery' => 'Entrega',
              _ => category,
            })
        .join(' · ');

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          const _SectionHeader(
            eyebrow: 'CONTA',
            title: 'Perfil',
            subtitle: 'Dados da conta e da operação do motorista.',
          ),
          const SizedBox(height: RamoSpacing.lg),
          _DriverProfileHero(
            driverId: supply.driverId,
            online: supply.online,
          ),
          const SizedBox(height: RamoSpacing.lg),
          _ProfileOption(
            icon: Icons.directions_car_filled_rounded,
            title: 'Veículo',
            subtitle: supply.vehicleId,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => _DriverVehicleDetailsScreen(
                    vehicleId: supply.vehicleId,
                    categories: categories,
                    seatCapacity: supply.seatCapacity,
                    fourByFour: supply.fourByFour,
                  ),
                ),
              );
            },
          ),
          _ProfileOption(
            icon: Icons.location_on_rounded,
            title: 'Localização',
            subtitle: 'Atualização automática durante o modo online',
            onTap: _updateLocation,
          ),
          if (widget.onLogout != null)
            _ProfileOption(
              icon: Icons.logout_rounded,
              title: 'Sair da conta',
              subtitle: 'Encerrar a sessão neste aparelho',
              onTap: _logout,
              destructive: true,
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final supply = _supply;

    if (_loading || supply == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: IndexedStack(
        index: _selectedTab,
        children: [
          _buildHomeMap(supply),
          _buildEarnings(),
          _buildActivity(supply),
          _buildProfile(supply),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedTab,
        onDestinationSelected: (index) {
          setState(() => _selectedTab = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map_rounded),
            label: 'Início',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet_rounded),
            label: 'Ganhos',
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

class _MapCircleButton extends StatelessWidget {
  const _MapCircleButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 5,
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon),
      ),
    );
  }
}

class _EarningsPill extends StatelessWidget {
  const _EarningsPill({
    required this.amountCents,
    required this.onTap,
  });

  final int amountCents;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RamoColors.brandBlack,
      elevation: 6,
      borderRadius: BorderRadius.circular(RamoRadius.pill),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RamoRadius.pill),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          child: Text(
            formatCents(amountCents),
            style: const TextStyle(
              color: RamoColors.brandYellow,
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
        ),
      ),
    );
  }
}

class _CompactMapMessage extends StatelessWidget {
  const _CompactMapMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 5,
      borderRadius: BorderRadius.circular(RamoRadius.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            const Icon(Icons.info_outline_rounded, size: 19),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapAvailabilityPanel extends StatelessWidget {
  const _MapAvailabilityPanel({
    super.key,
    required this.online,
    required this.changing,
    required this.onToggle,
    required this.onUpdateLocation,
  });

  final bool online;
  final bool changing;
  final ValueChanged<bool> onToggle;
  final VoidCallback onUpdateLocation;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 8,
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: online
            ? Row(
                children: [
                  const SizedBox.square(
                    dimension: 10,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: RamoColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Online',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                          ),
                        ),
                        Text(
                          'Procurando corridas por perto',
                          style: TextStyle(
                            color: RamoColors.muted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Atualizar localização',
                    onPressed: changing ? null : onUpdateLocation,
                    icon: const Icon(Icons.my_location_rounded),
                  ),
                  TextButton(
                    onPressed: changing ? null : () => onToggle(false),
                    child: const Text('Ficar offline'),
                  ),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Você está offline',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Entre online para começar a receber corridas.',
                    style: TextStyle(color: RamoColors.muted),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: 112,
                    height: 56,
                    child: FilledButton(
                      key: const Key('driver-go-online'),
                      onPressed: changing ? null : () => onToggle(true),
                      style: FilledButton.styleFrom(
                        backgroundColor: RamoColors.brandYellow,
                        foregroundColor: RamoColors.brandBlack,
                        shape: const StadiumBorder(),
                      ),
                      child: changing
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text(
                              'INICIAR',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                letterSpacing: .5,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: const TextStyle(
            color: RamoColors.muted,
            fontWeight: FontWeight.w900,
            fontSize: 11,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          title,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: -1,
              ),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: RamoColors.muted,
              ),
        ),
      ],
    );
  }
}

class _DriverProfileHero extends StatelessWidget {
  const _DriverProfileHero({
    required this.driverId,
    required this.online,
  });

  final String driverId;
  final bool online;

  @override
  Widget build(BuildContext context) {
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
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Motorista Ramo Nessa',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 19,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  driverId,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
          Text(
            online ? 'ONLINE' : 'OFFLINE',
            style: TextStyle(
              color: online ? RamoColors.brandYellow : Colors.white70,
              fontWeight: FontWeight.w900,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileOption extends StatelessWidget {
  const _ProfileOption({
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
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _DriverVehicleDetailsScreen extends StatelessWidget {
  const _DriverVehicleDetailsScreen({
    required this.vehicleId,
    required this.categories,
    required this.seatCapacity,
    required this.fourByFour,
  });

  final String vehicleId;
  final String categories;
  final int seatCapacity;
  final bool fourByFour;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Veículo')),
      body: ListView(
        padding: const EdgeInsets.all(RamoSpacing.lg),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Veículo aprovado'),
            subtitle: Text(vehicleId),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Categorias'),
            subtitle: Text(categories.isEmpty ? '—' : categories),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Capacidade'),
            subtitle: Text('$seatCapacity lugares'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('4x4'),
            subtitle: Text(fourByFour ? 'Aprovado' : 'Não habilitado'),
          ),
        ],
      ),
    );
  }
}

class _DriverFinanceCard extends StatelessWidget {
  const _DriverFinanceCard({
    required this.finance,
    required this.loading,
    required this.requesting,
    required this.onRefresh,
    required this.onRequestPayout,
  });

  final DriverFinanceSummary? finance;
  final bool loading;
  final bool requesting;
  final VoidCallback onRefresh;
  final VoidCallback onRequestPayout;

  void _showWalletStatement(BuildContext context) {
    final current = finance;
    if (current == null) return;

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final cashDebt = current.cashCommissionDebtCents;

        return SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                RamoSpacing.lg,
                0,
                RamoSpacing.lg,
                RamoSpacing.xl,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                Text(
                  'Extrato da carteira',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                const SizedBox(height: RamoSpacing.md),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Disponível para saque'),
                  trailing: Text(
                    formatCents(current.availableBalanceCents),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Em processamento'),
                  trailing: Text(
                    formatCents(current.payoutPendingCents),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                if (cashDebt > 0) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Taxa de uso do app pendente'),
                    trailing: Text(
                      formatCents(cashDebt),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const Text(
                    'Esse valor vem de corridas recebidas em dinheiro e '
                    'será compensado automaticamente pelos próximos '
                    'recebimentos digitais.',
                  ),
                ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final available = finance?.availableBalanceCents ?? 0;
    final pending = finance?.payoutPendingCents ?? 0;

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.brandBlack,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.account_balance_wallet_rounded,
                color: RamoColors.brandYellow,
              ),
              SizedBox(width: RamoSpacing.xs),
              Text(
                'Ganhos',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.md),
          Text(
            loading && finance == null
                ? 'Carregando…'
                : formatCents(available),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
          ),
          const Text(
            'Disponível para saque',
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: RamoSpacing.sm),
          Text(
            'Em processamento: ${formatCents(pending)}',
            style: const TextStyle(
              color: RamoColors.brandYellow,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed:
                  finance == null ? null : () => _showWalletStatement(context),
              icon: const Icon(Icons.receipt_long_rounded),
              label: const Text('Ver extrato'),
            ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          const Text(
            'O saque já pode ser reservado no app. O envio Pix real '
            'será ativado quando o provedor de repasses estiver conectado.',
            style: TextStyle(color: Colors.white70, fontSize: 12),
          ),
          const SizedBox(height: RamoSpacing.md),
          Row(
            children: [
              IconButton(
                onPressed: loading ? null : onRefresh,
                color: Colors.white,
                tooltip: 'Atualizar saldo',
                icon: const Icon(Icons.refresh_rounded),
              ),
              const SizedBox(width: RamoSpacing.xs),
              Expanded(
                child: FilledButton(
                  onPressed:
                      available > 0 && !requesting ? onRequestPayout : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: RamoColors.brandYellow,
                    foregroundColor: RamoColors.brandBlack,
                  ),
                  child: requesting
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Solicitar saque'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
    super.key,
    required this.offer,
    required this.busy,
    required this.onAccept,
    required this.onReject,
  });

  final DriverOffer offer;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final remaining = offer.expiresAt.difference(DateTime.now());
    final seconds = remaining.isNegative ? 0 : remaining.inSeconds;
    final expired = seconds <= 0;

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: .55),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: RamoSpacing.sm,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: RamoColors.brandYellow,
                  borderRadius: BorderRadius.circular(RamoRadius.pill),
                ),
                child: const Text(
                  'Nova corrida',
                  style: TextStyle(
                    color: RamoColors.brandBlack,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .6,
                  ),
                ),
              ),
              const Spacer(),
              Row(
                children: [
                  const Icon(Icons.timer_outlined, size: 17),
                  const SizedBox(width: 4),
                  Text(
                    '${seconds}s',
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.lg),
          Text(
            formatCents(offer.driverEarningsCents),
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.2,
                ),
          ),
          Text(
            'Você recebe',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: RamoColors.muted,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: RamoSpacing.lg),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(RamoSpacing.md),
            decoration: BoxDecoration(
              color: RamoColors.surfaceRaised,
              borderRadius: BorderRadius.circular(RamoRadius.md),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${offer.origin.displayName} → ${offer.destination.displayName}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.35,
                      ),
                ),
                const SizedBox(height: RamoSpacing.xs),
                Text(
                  '${offer.categoryLabel} · ${offer.passengers} '
                  '${offer.passengers == 1 ? 'passageiro' : 'passageiros'}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: RamoColors.muted,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Coleta a aprox. '
                  '${offer.approximatePickupDistanceKm.toStringAsFixed(1)} km',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (offer.pickupCompensationCents > 0) ...[
            const SizedBox(height: RamoSpacing.sm),
            Text(
              '+ ${formatCents(offer.pickupCompensationCents)} '
              'de coleta distante, integral para você',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
          if (offer.isCash && offer.cashCollectionAmountCents != null) ...[
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Pagamento em dinheiro · cobrar '
              '${formatCents(offer.cashCollectionAmountCents!)}',
              style: const TextStyle(
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
          const SizedBox(height: RamoSpacing.lg),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy || expired ? null : onReject,
                  child: const Text('Recusar'),
                ),
              ),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 50,
                  child: FilledButton(
                    onPressed: busy || expired ? null : onAccept,
                    child: busy
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          )
                        : const Text('Aceitar'),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActiveRideCard extends StatelessWidget {
  const _ActiveRideCard({
    super.key,
    required this.ride,
    required this.busy,
    required this.onNavigate,
    required this.onArrived,
    required this.onStart,
    required this.onComplete,
    this.route,
  });

  final AcceptedDriverRide ride;
  final bool busy;
  final VoidCallback onNavigate;
  final VoidCallback onArrived;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final DriverRouteInfo? route;

  String get _title => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'A caminho do embarque',
        'DRIVER_ARRIVED' => 'Você chegou',
        'IN_PROGRESS' => 'Corrida em andamento',
        'COMPLETED' => 'Corrida finalizada',
        _ => 'Corrida ativa',
      };

  String? get _actionLabel => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'Cheguei',
        'DRIVER_ARRIVED' => 'Iniciar corrida',
        'IN_PROGRESS' => 'Finalizar corrida',
        'COMPLETED' => 'Concluir repasse',
        _ => null,
      };

  VoidCallback? get _action => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => onArrived,
        'DRIVER_ARRIVED' => onStart,
        'IN_PROGRESS' || 'COMPLETED' => onComplete,
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        border: Border.all(color: RamoColors.success),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.check_circle_rounded,
                color: RamoColors.success,
              ),
              const SizedBox(width: RamoSpacing.sm),
              Text(
                _title,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.md),
          Text(
            '${ride.origin.displayName} → ${ride.destination.displayName}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          if (route != null)
            Text(
              '${route!.durationLabel} · ${route!.distanceLabel}',
              style: const TextStyle(
                color: RamoColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          if (route != null) const SizedBox(height: 4),
          Text('Seu ganho: ${formatCents(ride.driverEarningsCents)}'),
          if (ride.isCash &&
              ride.cashCollectionAmountCents != null) ...[
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Receber em dinheiro: '
              '${formatCents(ride.cashCollectionAmountCents!)}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
          if (ride.pickupLatitude != null && ride.pickupLongitude != null)
            Padding(
              padding: const EdgeInsets.only(top: RamoSpacing.sm),
              child: Text(
                'Embarque: '
                '${ride.pickupLatitude!.toStringAsFixed(5)}, '
                '${ride.pickupLongitude!.toStringAsFixed(5)}',
              ),
            ),
          if (
            (ride.state == 'DRIVER_ASSIGNED' ||
                ride.state == 'DRIVER_ARRIVING') &&
            ride.pickupLatitude != null &&
            ride.pickupLongitude != null
          ) ...[
            const SizedBox(height: RamoSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onNavigate,
                icon: const Icon(Icons.navigation_rounded),
                label: const Text('Navegar até o embarque'),
              ),
            ),
          ] else if (
            ride.state == 'IN_PROGRESS' &&
            ride.dropoffLatitude != null &&
            ride.dropoffLongitude != null
          ) ...[
            const SizedBox(height: RamoSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onNavigate,
                icon: const Icon(Icons.navigation_rounded),
                label: const Text('Navegar até o destino'),
              ),
            ),
          ],
          if (_actionLabel != null) ...[
            const SizedBox(height: RamoSpacing.md),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : _action,
                child: busy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_actionLabel!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WaitingCard extends StatelessWidget {
  const _WaitingCard({
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
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        children: [
          Icon(icon, size: 52),
          const SizedBox(height: RamoSpacing.md),
          Text(
            title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(subtitle, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
