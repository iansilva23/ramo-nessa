import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/driver_core_config.dart';
import '../../../core/location/device_driver_location_service.dart';
import '../../../core/location/driver_location_service.dart';
import '../../../core/navigation/driver_navigation_service.dart';
import '../../../core/navigation/external_driver_navigation_service.dart';
import '../../../core/communications/app_release_policy_service.dart';
import '../../../core/communications/social_links_service.dart';
import '../../finance/presentation/driver_statement_screen.dart';
import '../../finance/presentation/driver_wallet_screen.dart';
import '../../profile/presentation/driver_documents_screen.dart';
import '../../profile/presentation/driver_notifications_screen.dart';
import '../../profile/presentation/driver_ride_summary_screen.dart';
import '../../profile/presentation/driver_security_screen.dart';
import '../../profile/presentation/driver_settings_screen.dart';
import '../../profile/presentation/driver_support_screen.dart';
import '../../profile/presentation/driver_terms_screen.dart';
import '../data/driver_api.dart';
import '../data/driver_realtime_service.dart';
import '../data/driver_route_service.dart';
import '../data/http_driver_api.dart';
import '../data/io_driver_realtime_service.dart';
import '../domain/driver_models.dart';
import '../domain/driver_route_info.dart';
import 'driver_ride_chat_screen.dart';
import 'driver_route_refresh_policy.dart';
import 'widgets/driver_live_map.dart';

enum _DriverActivityPeriod {
  sevenDays,
  fifteenDays,
  thirtyDays,
  threeMonths,
  custom,
}

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    this.accessToken,
    this.onLogout,
    this.api,
    this.locationService,
    this.navigationService,
    this.routeService,
    this.realtimeService,
    this.releasePolicyService,
    this.socialLinksService,
  });

  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRouteService? routeService;
  final DriverRealtimeService? realtimeService;
  final AppReleasePolicyService? releasePolicyService;
  final SocialLinksService? socialLinksService;

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

  late final SocialLinksService? _socialLinksService =
      widget.socialLinksService ??
          (DriverCoreConfig.enabled
              ? HttpSocialLinksService(
                  baseUrl: DriverCoreConfig.baseUri!,
                )
              : null);

  DriverSupplySnapshot? _supply;
  DriverOffer? _offer;
  AcceptedDriverRide? _activeRide;
  DriverFinanceSummary? _finance;
  DriverProfileSnapshot? _profile;
  DriverActivitySnapshot? _activity;
  _DriverActivityPeriod _activityPeriod =
      _DriverActivityPeriod.sevenDays;
  DateTimeRange? _activityCustomRange;
  int _activityRequestId = 0;
  AppSocialLinks? _socialLinks;
  List<NearbyDriverPosition> _nearbyDrivers = const [];
  bool _nearbyRequestInFlight = false;
  bool _profileLoading = false;
  bool _profilePhotoUpdating = false;
  bool _activityLoading = false;
  DriverRouteInfo? _activeRoute;
  DriverRouteInfo? _offerPickupRoute;
  DriverRouteInfo? _offerTripRoute;
  String? _offerRouteAttemptOfferId;
  String? _offerRoutesReadyForOfferId;
  DateTime? _lastOfferRouteAttemptAt;
  final DriverMapController _mapController = DriverMapController();
  bool _mapReady = false;
  DateTime? _lastRouteRefreshAt;
  bool _navigationMode = false;
  bool _ridePanelExpanded = false;
  int _selectedTab = 0;
  late final DriverRouteService _routeService =
      widget.routeService ??
          (DriverCoreConfig.enabled
              ? CoreDriverRouteService(
                  baseUrl: DriverCoreConfig.baseUri!,
                  accessToken: _accessToken,
                )
              : const _UnavailableDriverRouteService());
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
  Timer? _nearbyTimer;
  StreamSubscription<DriverPosition>? _locationSubscription;
  StreamSubscription<DriverRealtimeUpdate>? _realtimeSubscription;
  bool _locationSyncInFlight = false;
  bool _releaseDialogShown = false;
  bool _registryAccessBlocked = false;

  @override
  void initState() {
    super.initState();
    _load();
    unawaited(_loadSocialLinks());
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
    _nearbyTimer?.cancel();
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
      _registryAccessBlocked = false;
      _loading = false;
      _message = null;
    });

    await _refreshFinance(showError: false);
    unawaited(_refreshProfile());
    unawaited(_refreshActivity());

    if (supply.online) {
      _startLocationTracking();
      _startRealtime();
      if (!supply.busy) _startNearbyPolling();
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
    if (mounted) {
      setState(() {
        _loading = true;
        _message = null;
      });
    }
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
      if (error.code == 'DRIVER_REGISTRY_NOT_APPROVED') {
        DriverProfileSnapshot? profile;
        try {
          profile = await api.profile();
        } catch (_) {
          // O status do cadastro é auxiliar aqui. O bloqueio do Core
          // continua sendo a fonte de verdade mesmo se o perfil falhar.
        }
        if (!mounted) return;
        setState(() {
          _profile = profile ?? _profile;
          _registryAccessBlocked = true;
          _loading = false;
          _message = profile == null ? error.message : null;
        });
        return;
      }

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
        _registryAccessBlocked = false;
        _loading = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _registryAccessBlocked = false;
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
        unawaited(
          _mapController.move(
            LatLng(updated.latitude, updated.longitude),
            _navigationMode ? 17.2 : _mapController.currentZoom,
          ),
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
            if (update.ride == null) {
              _navigationMode = false;
              _activeRoute = null;
            }
          }
        });

        if (update.offerUpdated) {
          unawaited(_refreshOfferRoutes(update.offer));
        }
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

  void _startNearbyPolling() {
    _nearbyTimer?.cancel();
    _nearbyTimer = null;
    unawaited(_refreshNearbyDrivers());
  }

  void _stopNearbyPolling({bool clear = true}) {
    _nearbyTimer?.cancel();
    _nearbyTimer = null;
    if (clear && mounted && _nearbyDrivers.isNotEmpty) {
      setState(() => _nearbyDrivers = const []);
    }
  }

  Future<void> _refreshNearbyDrivers() async {
    final api = _api;
    final supply = _supply;
    if (
      api == null ||
      supply == null ||
      !supply.online ||
      supply.busy ||
      _nearbyRequestInFlight
    ) {
      return;
    }

    _nearbyRequestInFlight = true;
    var nextSeconds = 30;

    try {
      final snapshot = await api.nearbyDrivers();
      nextSeconds = snapshot.refreshAfterSeconds.clamp(15, 60);
      if (!mounted) return;
      setState(() {
        _nearbyDrivers =
            snapshot.enabled ? snapshot.drivers : const [];
      });
    } catch (_) {
      // Outros motoristas são informação auxiliar. Falha não interrompe
      // oferta, navegação ou localização do próprio motorista.
    } finally {
      _nearbyRequestInFlight = false;
      final current = _supply;
      if (
        mounted &&
        current != null &&
        current.online &&
        !current.busy
      ) {
        _nearbyTimer?.cancel();
        _nearbyTimer = Timer(
          Duration(seconds: nextSeconds),
          () => _refreshNearbyDrivers(),
        );
      }
    }
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
      unawaited(_refreshOfferRoutes(offer));
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
        if (!updated.busy) _startNearbyPolling();
      } else {
        _stopNearbyPolling();
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
      _stopNearbyPolling();
      setState(() {
        _activeRide = ride;
        _supply = supply;
        _offer = null;
        _offerPickupRoute = null;
        _offerTripRoute = null;
        _offerAction = false;
        _navigationMode = true;
        _ridePanelExpanded = false;
        _selectedTab = 0;
        _message = null;
      });
      await _startInAppNavigation();
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

  Future<void> _startInAppNavigation() async {
    final ride = _activeRide;
    final supply = _supply;
    if (ride == null || supply == null) return;

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

    setState(() {
      _navigationMode = true;
      _ridePanelExpanded = false;
      _selectedTab = 0;
      _message = null;
    });

    if (_mapReady) {
      await _mapController.move(
        LatLng(supply.latitude, supply.longitude),
        17.2,
      );
    }
    await _refreshActiveRoute(force: true);
  }

  void _stopInAppNavigation() {
    if (!_navigationMode) return;
    setState(() {
      _navigationMode = false;
      _ridePanelExpanded = true;
    });
  }

  Future<void> _openExternalNavigation() async {
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
        _message = 'Não foi possível abrir o Google Maps agora.';
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
        _navigationMode = false;
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
        _navigationMode = true;
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
        _navigationMode = false;
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
        _startNearbyPolling();
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
        _offerPickupRoute = null;
        _offerTripRoute = null;
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

  Future<void> _loadSocialLinks() async {
    final service = _socialLinksService;
    if (service == null) return;
    try {
      final links = await service.load();
      if (!mounted) return;
      setState(() => _socialLinks = links);
    } catch (_) {
      // Rede social é conteúdo auxiliar e não bloqueia a operação.
    }
  }

  Future<void> _refreshProfileAndSocial() async {
    await Future.wait([
      _refreshProfile(),
      _loadSocialLinks(),
    ]);
  }

  Future<void> _openInstagram() async {
    final rawUrl = _socialLinks?.instagramUrl?.trim();
    if (rawUrl == null || rawUrl.isEmpty) return;
    final uri = Uri.tryParse(rawUrl);
    if (uri == null) return;

    final opened = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Não foi possível abrir o Instagram agora.'),
      ),
    );
  }

  Future<void> _refreshProfile() async {
    final api = _api;
    if (api == null || _profileLoading) return;
    if (mounted) setState(() => _profileLoading = true);
    try {
      final profile = await api.profile();
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _profileLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _profileLoading = false);
    }
  }

  String? _profilePhotoMimeType(XFile file) {
    final mimeType = file.mimeType?.trim().toLowerCase();
    if (mimeType == 'image/jpeg' ||
        mimeType == 'image/png' ||
        mimeType == 'image/webp') {
      return mimeType;
    }

    final path = file.path.toLowerCase();
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    return null;
  }

  Future<void> _changeProfilePhoto() async {
    final api = _api;
    if (api == null || _profilePhotoUpdating) return;

    XFile? selected;
    try {
      selected = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 82,
        requestFullMetadata: false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message =
            'Não foi possível abrir sua galeria. Verifique a permissão de fotos.';
      });
      return;
    }

    if (selected == null || !mounted) return;

    final mimeType = _profilePhotoMimeType(selected);
    if (mimeType == null) {
      setState(() {
        _message = 'Escolha uma foto JPEG, PNG ou WebP.';
      });
      return;
    }

    try {
      final bytes = await selected.readAsBytes();
      if (bytes.length > 1500000) {
        if (!mounted) return;
        setState(() {
          _message =
              'A foto ficou maior que 1,5 MB. Escolha outra imagem.';
        });
        return;
      }

      setState(() {
        _profilePhotoUpdating = true;
        _message = null;
      });

      await api.updateProfilePhoto(
        mimeType: mimeType,
        bytes: bytes,
      );
      final profile = await api.profile();
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _profilePhotoUpdating = false;
        _message = null;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Foto do perfil atualizada.'),
          ),
        );
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _profilePhotoUpdating = false;
        _message = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _profilePhotoUpdating = false;
        _message = 'Não conseguimos atualizar sua foto agora.';
      });
    }
  }

  DateTime _activityStartOfDay(DateTime value) =>
      DateTime(value.year, value.month, value.day);

  DateTime _activityEndExclusive(DateTime value) =>
      DateTime(value.year, value.month, value.day + 1);

  ({DateTime from, DateTime to}) _activityRange() {
    final now = DateTime.now();
    final end = _activityEndExclusive(now);

    switch (_activityPeriod) {
      case _DriverActivityPeriod.sevenDays:
        return (
          from: _activityStartOfDay(
            now.subtract(const Duration(days: 6)),
          ),
          to: end,
        );
      case _DriverActivityPeriod.fifteenDays:
        return (
          from: _activityStartOfDay(
            now.subtract(const Duration(days: 14)),
          ),
          to: end,
        );
      case _DriverActivityPeriod.thirtyDays:
        return (
          from: _activityStartOfDay(
            now.subtract(const Duration(days: 29)),
          ),
          to: end,
        );
      case _DriverActivityPeriod.threeMonths:
        return (
          from: _activityStartOfDay(
            now.subtract(const Duration(days: 89)),
          ),
          to: end,
        );
      case _DriverActivityPeriod.custom:
        final range = _activityCustomRange;
        if (range == null) {
          return (
            from: _activityStartOfDay(
              now.subtract(const Duration(days: 6)),
            ),
            to: end,
          );
        }
        return (
          from: _activityStartOfDay(range.start),
          to: _activityEndExclusive(range.end),
        );
    }
  }

  String _activityPeriodLabel(_DriverActivityPeriod period) =>
      switch (period) {
        _DriverActivityPeriod.sevenDays => '7 dias',
        _DriverActivityPeriod.fifteenDays => '15 dias',
        _DriverActivityPeriod.thirtyDays => '30 dias',
        _DriverActivityPeriod.threeMonths => '3 meses',
        _DriverActivityPeriod.custom => 'Personalizado',
      };

  String _activityDateLabel(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day/$month/${value.year}';
  }

  Future<void> _selectActivityPeriod(
    _DriverActivityPeriod period,
  ) async {
    if (period == _DriverActivityPeriod.custom) {
      final now = DateTime.now();
      final initial = _activityCustomRange ??
          DateTimeRange(
            start: now.subtract(const Duration(days: 6)),
            end: now,
          );
      final selected = await showDateRangePicker(
        context: context,
        firstDate: DateTime(now.year - 2),
        lastDate: now,
        initialDateRange: initial,
        helpText: 'Escolha o período',
        cancelText: 'Cancelar',
        confirmText: 'Aplicar',
        saveText: 'Aplicar',
      );
      if (selected == null || !mounted) return;
      setState(() {
        _activityPeriod = period;
        _activityCustomRange = selected;
      });
      await _refreshActivity(force: true);
      return;
    }

    if (_activityPeriod == period) return;
    setState(() => _activityPeriod = period);
    await _refreshActivity(force: true);
  }

  Future<void> _refreshActivity({bool force = false}) async {
    final api = _api;
    if (api == null || (_activityLoading && !force)) return;

    final requestId = ++_activityRequestId;
    final range = _activityRange();
    if (mounted) setState(() => _activityLoading = true);

    try {
      final activity = await api.activity(
        from: range.from,
        to: range.to,
      );
      if (!mounted || requestId != _activityRequestId) return;
      setState(() {
        _activity = activity;
        _activityLoading = false;
      });
    } catch (_) {
      if (!mounted || requestId != _activityRequestId) return;
      setState(() => _activityLoading = false);
    }
  }

  Future<void> _refreshOfferRoutes(DriverOffer? offer) async {
    final service = _routeService;
    final supply = _supply;
    if (supply == null || offer == null) {
      _offerRouteAttemptOfferId = null;
      _offerRoutesReadyForOfferId = null;
      _lastOfferRouteAttemptAt = null;
      if (mounted) {
        setState(() {
          _offerPickupRoute = null;
          _offerTripRoute = null;
        });
      }
      return;
    }

    final isNewOffer = _offerRouteAttemptOfferId != offer.id;
    if (isNewOffer) {
      _offerRouteAttemptOfferId = offer.id;
      _offerRoutesReadyForOfferId = null;
      _lastOfferRouteAttemptAt = null;
      if (mounted) {
        setState(() {
          _offerPickupRoute = null;
          _offerTripRoute = null;
        });
      }
    }

    if (_offerRoutesReadyForOfferId == offer.id) return;

    final now = DateTime.now();
    if (
      _lastOfferRouteAttemptAt != null &&
      now.difference(_lastOfferRouteAttemptAt!) <
          const Duration(seconds: 15)
    ) {
      return;
    }

    final pickupLat = offer.pickupLatitude;
    final pickupLng = offer.pickupLongitude;
    if (pickupLat == null || pickupLng == null) return;

    _lastOfferRouteAttemptAt = now;
    try {
      final pickup = LatLng(pickupLat, pickupLng);
      final pickupRoute = await service.route(
        origin: LatLng(supply.latitude, supply.longitude),
        destination: pickup,
      );

      DriverRouteInfo? tripRoute;
      final dropoffLat = offer.dropoffLatitude;
      final dropoffLng = offer.dropoffLongitude;
      if (dropoffLat != null && dropoffLng != null) {
        tripRoute = await service.route(
          origin: pickup,
          destination: LatLng(dropoffLat, dropoffLng),
        );
      }

      if (!mounted || _offer?.id != offer.id) return;
      setState(() {
        _offerPickupRoute = pickupRoute;
        _offerTripRoute = tripRoute;
        _offerRoutesReadyForOfferId = offer.id;
      });
    } catch (_) {
      // A oferta mantém as distâncias autoritativas do Core. Se o
      // provedor falhar, a próxima tentativa só acontece após a janela
      // de proteção para não gerar rajadas de chamadas.
    }
  }

  Future<void> _refreshActiveRoute({bool force = false}) async {
    final service = _routeService;
    final supply = _supply;
    final ride = _activeRide;
    if (supply == null || ride == null) {
      if (mounted && _activeRoute != null) {
        setState(() => _activeRoute = null);
      }
      return;
    }

    final now = DateTime.now();
    final currentPosition = LatLng(
      supply.latitude,
      supply.longitude,
    );
    if (
      !DriverRouteRefreshPolicy.shouldRefresh(
        now: now,
        currentPosition: currentPosition,
        currentRoute: _activeRoute,
        lastAttemptAt: _lastRouteRefreshAt,
        force: force,
      )
    ) {
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
        origin: currentPosition,
        destination: LatLng(latitude, longitude),
      );
      if (!mounted) return;
      setState(() => _activeRoute = route);
    } catch (_) {
      // A navegação externa continua disponível mesmo quando a rota
      // embutida não puder ser recalculada. O timestamp do último
      // intento impede rajadas contra o provedor quando ele está instável.
    }
  }

  Future<void> _openRideChat() async {
    final api = _api;
    final ride = _activeRide;
    if (api == null || ride == null) return;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DriverRideChatScreen(
          api: api,
          rideId: ride.id,
        ),
      ),
    );
  }

  void _centerDriverOnMap() {
    final supply = _supply;
    if (!_mapReady || supply == null) return;
    unawaited(
      _mapController.move(
        LatLng(supply.latitude, supply.longitude),
        _mapController.currentZoom,
      ),
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
          navigationMode: _navigationMode,
          nearbyDrivers:
              _activeRide == null ? _nearbyDrivers : const [],
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
        if (_navigationMode && _activeRide != null)
          Positioned(
            top: 78,
            left: 14,
            right: 14,
            child: SafeArea(
              child: _NavigationInstructionBanner(
                route: _activeRoute,
                currentPosition: LatLng(
                  supply.latitude,
                  supply.longitude,
                ),
                targetLabel: _activeRide!.state == 'IN_PROGRESS'
                    ? _activeRide!.destination.displayName
                    : _activeRide!.origin.displayName,
                onStop: _stopInAppNavigation,
                onExternal: _openExternalNavigation,
              ),
            ),
          ),
        if (_message != null)
          Positioned(
            top: _navigationMode && _activeRide != null
                ? 198
                : 86,
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
                      pickupRoute: _offerPickupRoute,
                      tripRoute: _offerTripRoute,
                    )
                  : _activeRide != null
                      ? (_navigationMode && !_ridePanelExpanded
                          ? _ActiveRideCompactBar(
                              key: ValueKey(
                                'ride-mini-${_activeRide!.id}-${_activeRide!.state}',
                              ),
                              ride: _activeRide!,
                              route: _activeRoute,
                              onChat: _openRideChat,
                              onExpand: () => setState(
                                () => _ridePanelExpanded = true,
                              ),
                            )
                          : _ActiveRideCard(
                              key: ValueKey(
                                'ride-${_activeRide!.id}-${_activeRide!.state}',
                              ),
                              ride: _activeRide!,
                              busy: _rideAction,
                              navigationActive: _navigationMode,
                              onNavigate: _startInAppNavigation,
                              onStopNavigation: _stopInAppNavigation,
                              onExternalNavigation: _openExternalNavigation,
                              onArrived: _markArrived,
                              onStart: _startRide,
                              onComplete: _completeRide,
                              onChat: _openRideChat,
                              onMinimize: _navigationMode
                                  ? () => setState(
                                        () => _ridePanelExpanded = false,
                                      )
                                  : null,
                              route: _activeRoute,
                              currentPosition: LatLng(
                                supply.latitude,
                                supply.longitude,
                              ),
                            ))
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
              onOpenStatement: _api == null
                  ? null
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverStatementScreen(
                            api: _api,
                          ),
                        ),
                      );
                    },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActivity(DriverSupplySnapshot supply) {
    final activity = _activity;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _refreshActivity,
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
              eyebrow: 'CORRIDAS',
              title: 'Atividade',
              subtitle: 'Veja corridas e ganhos pelo período escolhido.',
            ),
            const SizedBox(height: RamoSpacing.md),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _DriverActivityPeriod.values
                    .map(
                      (period) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          key: ValueKey(
                            'driver-activity-filter-${period.name}',
                          ),
                          selected: _activityPeriod == period,
                          label: Text(_activityPeriodLabel(period)),
                          onSelected: (_) =>
                              _selectActivityPeriod(period),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
            if (_activityPeriod == _DriverActivityPeriod.custom &&
                _activityCustomRange != null) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                '${_activityDateLabel(_activityCustomRange!.start)} a '
                '${_activityDateLabel(_activityCustomRange!.end)}',
                style: const TextStyle(
                  color: RamoColors.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: RamoSpacing.lg),
            if (_activityLoading && activity == null)
              const Center(child: CircularProgressIndicator())
            else if (activity != null) ...[
              _ActivitySummaryGrid(activity: activity),
              const SizedBox(height: RamoSpacing.lg),
            ],
            if (_activeRide != null) ...[
              const Text(
                'Corrida atual',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 17,
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              _ActiveRideCard(
                ride: _activeRide!,
                busy: _rideAction,
                navigationActive: _navigationMode,
                onNavigate: _startInAppNavigation,
                onStopNavigation: _stopInAppNavigation,
                onExternalNavigation: _openExternalNavigation,
                onArrived: _markArrived,
                onStart: _startRide,
                onComplete: _completeRide,
                onChat: _openRideChat,
                route: _activeRoute,
                currentPosition: LatLng(
                  supply.latitude,
                  supply.longitude,
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
            ],
            const Text(
              'Corridas no período',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            if (activity == null || activity.rides.isEmpty)
              _WaitingCard(
                icon: Icons.history_rounded,
                title: 'Nenhuma corrida no histórico',
                subtitle: supply.online
                    ? 'Suas corridas aparecerão aqui quando forem concluídas.'
                    : 'Fique online pela tela Início quando quiser dirigir.',
              )
            else
              ...activity.rides.map(
                (ride) => Padding(
                  padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
                  child: _ActivityRideCard(ride: ride),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfile(DriverSupplySnapshot supply) {
    final profile = _profile;
    final fallbackCategories = supply.categories
        .map((category) => switch (category) {
              'moto' => 'Moto',
              'car' => 'Carro',
              'comfort_black' => 'Comfort / Black',
              'buggy' => 'Buggy',
              'delivery' => 'Entrega',
              _ => category,
            })
        .join(' · ');
    final profileCategories = profile?.vehicleCategories
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
      child: RefreshIndicator(
        onRefresh: _refreshProfileAndSocial,
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
              eyebrow: 'CONTA',
              title: 'Perfil',
              subtitle: 'Sua conta, veículo e preferências.',
            ),
            const SizedBox(height: RamoSpacing.lg),
            _DriverProfileHero(
              driverId: supply.driverId,
              online: supply.online,
              displayName: profile?.displayName,
              phone: profile?.phoneE164,
              photoPath: profile?.photoPath,
              ratingAverage: profile?.ratingAverage,
              ratingCount: profile?.ratingCount ?? 0,
              loading: _profileLoading && profile == null,
              changingPhoto: _profilePhotoUpdating,
              onChangePhoto: _api == null ? null : _changeProfilePhoto,
            ),
            const SizedBox(height: RamoSpacing.lg),
            _ProfileOption(
              icon: Icons.badge_outlined,
              title: 'Dados pessoais',
              subtitle: profile?.phoneE164 ?? 'Dados da sua conta',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _DriverPersonalDataScreen(
                      profile: profile,
                      driverId: supply.driverId,
                    ),
                  ),
                );
              },
            ),
            _ProfileOption(
              icon: Icons.receipt_long_rounded,
              title: 'Resumo de corridas',
              subtitle: _activity == null
                  ? 'Consultar sua atividade'
                  : '${_activity!.completed} concluídas · '
                      '${_activity!.cancelled} canceladas',
              onTap: _api == null
                  ? () {}
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverRideSummaryScreen(
                            api: _api,
                          ),
                        ),
                      );
                    },
            ),
            _ProfileOption(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Carteira',
              subtitle: _finance == null
                  ? 'Saldo e saques'
                  : 'Disponível: ${formatCents(_finance!.availableBalanceCents)}',
              onTap: _api == null
                  ? () {}
                  : () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverWalletScreen(
                            api: _api,
                            initialFinance: _finance,
                          ),
                        ),
                      );
                      if (mounted) {
                        await _refreshFinance(showError: false);
                      }
                    },
            ),
            _ProfileOption(
              icon: Icons.receipt_long_rounded,
              title: 'Extrato de ganhos',
              subtitle: 'Corridas, taxas, saques e saldo',
              onTap: _api == null
                  ? () {}
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverStatementScreen(
                            api: _api,
                          ),
                        ),
                      );
                    },
            ),
            _ProfileOption(
              icon: Icons.folder_copy_outlined,
              title: 'Documentos',
              subtitle: 'CNH, CRLV e status de aprovação',
              onTap: _api == null
                  ? () {}
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverDocumentsScreen(
                            api: _api,
                          ),
                        ),
                      );
                    },
            ),
            _ProfileOption(
              icon: Icons.directions_car_filled_rounded,
              title: 'Veículo',
              subtitle: profile?.vehicleLabel ?? supply.vehicleId,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _DriverVehicleDetailsScreen(
                      vehicleId: profile?.vehicleId ?? supply.vehicleId,
                      categories:
                          profileCategories?.isNotEmpty == true
                              ? profileCategories!
                              : fallbackCategories,
                      seatCapacity:
                          profile?.vehicleSeatCapacity ?? supply.seatCapacity,
                      fourByFour:
                          profile?.vehicleFourByFour ?? supply.fourByFour,
                      plate: profile?.vehiclePlate,
                      make: profile?.vehicleMake,
                      model: profile?.vehicleModel,
                      modelYear: profile?.vehicleYear,
                      color: profile?.vehicleColor,
                    ),
                  ),
                );
              },
            ),
            _ProfileOption(
              icon: Icons.notifications_none_rounded,
              title: 'Notificações',
              subtitle: 'Permissões e avisos do Ramo Nessa',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const DriverNotificationsScreen(),
                  ),
                );
              },
            ),
            _ProfileOption(
              icon: Icons.shield_outlined,
              title: 'Segurança',
              subtitle: 'Sessões, acessos e proteção da conta',
              onTap: _api == null
                  ? () {}
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverSecurityScreen(
                            api: _api,
                            profile: _profile,
                          ),
                        ),
                      );
                    },
            ),
            _ProfileOption(
              icon: Icons.support_agent_rounded,
              title: 'Suporte',
              subtitle: 'Abrir e acompanhar chamados',
              onTap: _api == null
                  ? () {}
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DriverSupportScreen(
                            api: _api,
                          ),
                        ),
                      );
                    },
            ),
            if (_socialLinks?.instagramUrl?.isNotEmpty == true)
              _ProfileOption(
                icon: Icons.alternate_email_rounded,
                title: 'Siga o Ramo Nessa no Instagram',
                subtitle:
                    _socialLinks?.instagramHandle ?? 'Instagram oficial',
                onTap: _openInstagram,
              ),
            _ProfileOption(
              icon: Icons.settings_outlined,
              title: 'Configurações',
              subtitle: 'Permissões, localização e informações do app',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const DriverSettingsScreen(),
                  ),
                );
              },
            ),
            _ProfileOption(
              icon: Icons.gavel_outlined,
              title: 'Termos e privacidade',
              subtitle: 'Uso do app, dados e informações legais',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const DriverTermsScreen(),
                  ),
                );
              },
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
      ),
    );
  }

  Widget _animatedMainTabs(
    DriverSupplySnapshot supply,
  ) {
    final pages = <Widget>[
      _buildHomeMap(supply),
      _buildEarnings(),
      _buildActivity(supply),
      _buildProfile(supply),
    ];

    return Stack(
      fit: StackFit.expand,
      children: List.generate(pages.length, (index) {
        final selected = index == _selectedTab;
        final horizontalOffset =
            selected ? 0.0 : (index < _selectedTab ? -0.025 : 0.025);

        return Offstage(
          offstage: !selected,
          child: IgnorePointer(
            ignoring: !selected,
            child: ExcludeSemantics(
              excluding: !selected,
              child: TickerMode(
                enabled: selected,
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 230),
                  curve: Curves.easeOutCubic,
                  opacity: selected ? 1 : 0,
                  child: AnimatedSlide(
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeOutCubic,
                    offset: Offset(horizontalOffset, 0),
                    child: pages[index],
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _premiumBottomNavigation(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 4, 12, 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: colors.outlineVariant.withValues(alpha: .55),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: .12),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: NavigationBar(
            height: 72,
            backgroundColor: colors.surface.withValues(alpha: .98),
            surfaceTintColor: Colors.transparent,
            indicatorColor: RamoColors.brandYellow,
            indicatorShape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
            ),
            selectedIndex: _selectedTab,
            onDestinationSelected: (index) {
              if (index == _selectedTab) return;
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
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final supply = _supply;

    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_registryAccessBlocked) {
      return _DriverApprovalStatusScreen(
        profile: _profile,
        fallbackMessage: _message,
        onRetry: _load,
        onLogout: widget.onLogout == null ? null : _logout,
      );
    }

    if (supply == null) {
      return _DriverStartupErrorScreen(
        message:
            _message ?? 'Não conseguimos iniciar o app do motorista.',
        onRetry: _load,
        onLogout: widget.onLogout == null ? null : _logout,
      );
    }

    return Scaffold(
      body: _animatedMainTabs(supply),
      bottomNavigationBar: _premiumBottomNavigation(context),
    );
  }
}


class _DriverApprovalStatusScreen extends StatelessWidget {
  const _DriverApprovalStatusScreen({
    required this.profile,
    required this.fallbackMessage,
    required this.onRetry,
    this.onLogout,
  });

  final DriverProfileSnapshot? profile;
  final String? fallbackMessage;
  final Future<void> Function() onRetry;
  final Future<void> Function()? onLogout;

  String _statusLabel(String? status) => switch (status) {
        'approved' => 'Aprovado',
        'pending' => 'Em análise',
        'suspended' => 'Suspenso',
        _ => 'Não concluído',
      };

  @override
  Widget build(BuildContext context) {
    final profileStatus = profile?.profileStatus;
    final vehicleStatus = profile?.vehicleStatus;
    final suspended =
        profileStatus == 'suspended' || vehicleStatus == 'suspended';
    final pending =
        profileStatus == 'pending' || vehicleStatus == 'pending';

    final title = suspended
        ? 'Acesso suspenso'
        : pending
            ? 'Cadastro em análise'
            : 'Cadastro ainda não aprovado';
    final description = fallbackMessage ??
        (suspended
            ? 'Seu acesso operacional está suspenso. Entre em contato com o suporte do Ramo Nessa para verificar o cadastro.'
            : 'Seu perfil e seu veículo precisam ser aprovados antes de liberar mapa, corridas e ganhos.');

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 32, 28, 40),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: RamoBrandLockup(),
                  ),
                  const SizedBox(height: 48),
                  Container(
                    width: 72,
                    height: 72,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: suspended
                          ? RamoColors.danger.withValues(alpha: .10)
                          : RamoColors.brandYellow.withValues(alpha: .18),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      suspended
                          ? Icons.block_rounded
                          : Icons.verified_user_outlined,
                      size: 36,
                      color: suspended
                          ? RamoColors.danger
                          : RamoColors.brandBlack,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    description,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: RamoColors.muted,
                          height: 1.45,
                        ),
                  ),
                  const SizedBox(height: 28),
                  _ApprovalStatusRow(
                    label: 'Perfil do motorista',
                    status: _statusLabel(profileStatus),
                    approved: profileStatus == 'approved',
                    blocked: profileStatus == 'suspended',
                  ),
                  const SizedBox(height: 10),
                  _ApprovalStatusRow(
                    label: 'Veículo',
                    status: _statusLabel(vehicleStatus),
                    approved: vehicleStatus == 'approved',
                    blocked: vehicleStatus == 'suspended',
                  ),
                  const SizedBox(height: 28),
                  FilledButton.icon(
                    key: const Key('driver-approval-retry'),
                    onPressed: () => onRetry(),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Verificar novamente'),
                  ),
                  if (onLogout != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      key: const Key('driver-approval-logout'),
                      onPressed: () => onLogout!(),
                      child: const Text('Sair da conta'),
                    ),
                  ],
                  const SizedBox(height: 10),
                  const Text(
                    'O acesso às corridas só é liberado após a aprovação cadastral.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ApprovalStatusRow extends StatelessWidget {
  const _ApprovalStatusRow({
    required this.label,
    required this.status,
    required this.approved,
    required this.blocked,
  });

  final String label;
  final String status;
  final bool approved;
  final bool blocked;

  @override
  Widget build(BuildContext context) {
    final tone = approved
        ? RamoColors.success
        : blocked
            ? RamoColors.danger
            : RamoColors.brandBlack;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.md),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: .55),
        ),
      ),
      child: Row(
        children: [
          Icon(
            approved
                ? Icons.check_circle_rounded
                : blocked
                    ? Icons.block_rounded
                    : Icons.schedule_rounded,
            color: tone,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          Text(
            status,
            style: TextStyle(
              color: tone,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverStartupErrorScreen extends StatelessWidget {
  const _DriverStartupErrorScreen({
    required this.message,
    required this.onRetry,
    this.onLogout,
  });

  final String message;
  final Future<void> Function() onRetry;
  final Future<void> Function()? onLogout;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.error_outline_rounded, size: 48),
                  const SizedBox(height: 18),
                  const Text(
                    'Não conseguimos iniciar agora',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: RamoColors.muted),
                  ),
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: () => onRetry(),
                    child: const Text('Tentar novamente'),
                  ),
                  if (onLogout != null)
                    TextButton(
                      onPressed: () => onLogout!(),
                      child: const Text('Sair da conta'),
                    ),
                ],
              ),
            ),
          ),
        ),
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
      elevation: 0,
      shape: const CircleBorder(),
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: RamoElevation.floating(context),
        ),
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon, size: 23),
        ),
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
      elevation: 0,
      borderRadius: BorderRadius.circular(RamoRadius.pill),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(RamoRadius.pill),
          boxShadow: RamoElevation.floating(context),
        ),
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
                letterSpacing: -0.25,
              ),
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
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: RamoElevation.floating(context),
      ),
      child: online ? _onlineContent(context) : _offlineContent(context),
    );
  }

  Widget _onlineContent(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: RamoColors.success.withValues(alpha: .12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_rounded,
                color: RamoColors.success,
                size: 20,
              ),
            ),
            const SizedBox(width: 11),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Você está online',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 17,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Procurando corridas próximas',
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
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton(
            key: const Key('driver-go-offline'),
            onPressed: changing ? null : () => onToggle(false),
            child: changing
                ? const SizedBox.square(
                    dimension: 19,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'Ficar offline',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _offlineContent(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: const BoxDecoration(
                color: RamoColors.surfaceRaised,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.power_settings_new_rounded,
                size: 19,
              ),
            ),
            const SizedBox(width: 11),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Você está offline',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 17,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Fique online quando estiver pronto para dirigir.',
                    style: TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            key: const Key('driver-go-online'),
            onPressed: changing ? null : () => onToggle(true),
            style: FilledButton.styleFrom(
              backgroundColor: RamoColors.brandYellow,
              foregroundColor: RamoColors.brandBlack,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            icon: changing
                ? const SizedBox.shrink()
                : const Icon(Icons.power_settings_new_rounded),
            label: changing
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'Ficar online',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                    ),
                  ),
          ),
        ),
      ],
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
    this.displayName,
    this.phone,
    this.photoPath,
    this.ratingAverage,
    this.ratingCount = 0,
    this.loading = false,
    this.changingPhoto = false,
    this.onChangePhoto,
  });

  final String driverId;
  final bool online;
  final String? displayName;
  final String? phone;
  final String? photoPath;
  final double? ratingAverage;
  final int ratingCount;
  final bool loading;
  final bool changingPhoto;
  final VoidCallback? onChangePhoto;

  String? get _photoUrl {
    final path = photoPath?.trim();
    final base = DriverCoreConfig.baseUri;
    if (path == null || path.isEmpty || base == null) return null;
    return base.resolve(path).toString();
  }

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
          Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: RamoColors.brandYellow,
                foregroundColor: RamoColors.brandBlack,
                backgroundImage:
                    _photoUrl == null ? null : NetworkImage(_photoUrl!),
                child: _photoUrl == null
                    ? const Icon(Icons.person_rounded, size: 34)
                    : null,
              ),
              Positioned(
                right: -5,
                bottom: -5,
                child: Material(
                  color: RamoColors.brandYellow,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: changingPhoto ? null : onChangePhoto,
                    child: SizedBox.square(
                      dimension: 30,
                      child: changingPhoto
                          ? const Padding(
                              padding: EdgeInsets.all(7),
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: RamoColors.brandBlack,
                              ),
                            )
                          : const Icon(
                              Icons.camera_alt_rounded,
                              size: 17,
                              color: RamoColors.brandBlack,
                            ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  loading
                      ? 'Carregando perfil…'
                      : (displayName?.trim().isNotEmpty == true
                          ? displayName!.trim()
                          : 'Motorista Ramo Nessa'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 19,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  phone?.trim().isNotEmpty == true ? phone! : driverId,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(
                      Icons.star_rounded,
                      color: RamoColors.brandYellow,
                      size: 18,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      ratingAverage == null
                          ? 'Novo motorista'
                          : ratingAverage!.toStringAsFixed(2),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                    if (ratingCount > 0) ...[
                      const SizedBox(width: 4),
                      Text(
                        '($ratingCount)',
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
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

class _ActivitySummaryGrid extends StatelessWidget {
  const _ActivitySummaryGrid({required this.activity});

  final DriverActivitySnapshot activity;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Total', activity.total.toString()),
      ('Concluídas', activity.completed.toString()),
      ('Canceladas', activity.cancelled.toString()),
      ('Ganhos', formatCents(activity.earningsCents)),
    ];

    return Wrap(
      spacing: RamoSpacing.sm,
      runSpacing: RamoSpacing.sm,
      children: items
          .map(
            (item) => SizedBox(
              width: (MediaQuery.sizeOf(context).width -
                      RamoSpacing.lg * 2 -
                      RamoSpacing.sm) /
                  2,
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
                        fontSize: 20,
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

class _ActivityRideCard extends StatelessWidget {
  const _ActivityRideCard({required this.ride});

  final DriverActivityRide ride;

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
                    '${ride.origin.displayName} → '
                    '${ride.destination.displayName}',
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
              formatCents(ride.driverEarningsCents),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverPersonalDataScreen extends StatelessWidget {
  const _DriverPersonalDataScreen({
    required this.profile,
    required this.driverId,
  });

  final DriverProfileSnapshot? profile;
  final String driverId;

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
            subtitle: Text(profile?.fullName ?? 'Não informado'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Nome de exibição'),
            subtitle: Text(profile?.displayName ?? 'Motorista Ramo Nessa'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Telefone'),
            subtitle: Text(profile?.phoneE164 ?? 'Não informado'),
          ),
          if (profile?.email != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('E-mail'),
              subtitle: Text(profile!.email!),
            ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Identificador'),
            subtitle: Text(driverId),
          ),
        ],
      ),
    );
  }
}

class _DriverVehicleDetailsScreen extends StatelessWidget {
  const _DriverVehicleDetailsScreen({
    required this.vehicleId,
    required this.categories,
    required this.seatCapacity,
    required this.fourByFour,
    this.plate,
    this.make,
    this.model,
    this.modelYear,
    this.color,
  });

  final String vehicleId;
  final String categories;
  final int seatCapacity;
  final bool fourByFour;
  final String? plate;
  final String? make;
  final String? model;
  final int? modelYear;
  final String? color;

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
          if (plate != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Placa'),
              subtitle: Text(plate!),
            ),
          if (make != null || model != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Modelo'),
              subtitle: Text(
                [
                  if (make != null) make!,
                  if (model != null) model!,
                  if (modelYear != null) modelYear.toString(),
                ].join(' '),
              ),
            ),
          if (color != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Cor'),
              subtitle: Text(color!),
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
    required this.onOpenStatement,
  });

  final DriverFinanceSummary? finance;
  final bool loading;
  final bool requesting;
  final VoidCallback onRefresh;
  final VoidCallback onRequestPayout;
  final VoidCallback? onOpenStatement;

  void _showWalletStatement(BuildContext context) {
    onOpenStatement?.call();
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
                  finance == null || onOpenStatement == null
                      ? null
                      : () => _showWalletStatement(context),
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
    this.pickupRoute,
    this.tripRoute,
  });

  final DriverOffer offer;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onReject;
  final DriverRouteInfo? pickupRoute;
  final DriverRouteInfo? tripRoute;

  @override
  Widget build(BuildContext context) {
    final remaining = offer.expiresAt.difference(DateTime.now());
    final seconds = remaining.isNegative ? 0 : remaining.inSeconds;
    final expired = seconds <= 0;
    final pickupDistance = pickupRoute?.distanceLabel ??
        '${offer.approximatePickupDistanceKm.toStringAsFixed(1)} km';
    final pickupDuration = pickupRoute?.durationLabel;
    final tripDistance = tripRoute?.distanceLabel ??
        (offer.tripDistanceKm == null
            ? null
            : '${offer.tripDistanceKm!.toStringAsFixed(1)} km');
    final tripDuration = tripRoute?.durationLabel;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: RamoElevation.floating(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: RamoColors.brandYellow,
                  borderRadius: BorderRadius.circular(RamoRadius.pill),
                ),
                child: const Text(
                  'NOVA CORRIDA',
                  style: TextStyle(
                    color: RamoColors.brandBlack,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .8,
                  ),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: expired
                      ? Theme.of(context).colorScheme.errorContainer
                      : RamoColors.brandBlack,
                  borderRadius: BorderRadius.circular(RamoRadius.pill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.timer_outlined,
                      size: 15,
                      color: expired
                          ? Theme.of(context).colorScheme.onErrorContainer
                          : RamoColors.brandYellow,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      '${seconds}s',
                      style: TextStyle(
                        color: expired
                            ? Theme.of(context).colorScheme.onErrorContainer
                            : Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'VOCÊ RECEBE',
                      style: TextStyle(
                        color: RamoColors.muted,
                        fontWeight: FontWeight.w900,
                        fontSize: 10,
                        letterSpacing: .8,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      formatCents(offer.driverEarningsCents),
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.3,
                          ),
                    ),
                  ],
                ),
              ),
              _DriverMetaPill(
                icon: Icons.directions_car_filled_rounded,
                label: offer.categoryLabel,
              ),
            ],
          ),
          const SizedBox(height: 18),
          _DriverRouteTimeline(
            origin: offer.origin.displayName,
            destination: offer.destination.displayName,
          ),
          const SizedBox(height: 16),
          _DriverTripMetrics(
            pickupDuration: pickupDuration,
            pickupDistance: pickupDistance,
            tripDuration: tripDuration,
            tripDistance: tripDistance,
            passengers: offer.passengers,
          ),
          if (offer.pickupCompensationCents > 0) ...[
            const SizedBox(height: 12),
            _DriverNoticeStrip(
              icon: Icons.add_road_rounded,
              text:
                  '+ ${formatCents(offer.pickupCompensationCents)} de coleta distante, integral para você',
            ),
          ],
          if (offer.isCash && offer.cashCollectionAmountCents != null) ...[
            const SizedBox(height: 8),
            _DriverNoticeStrip(
              icon: Icons.payments_outlined,
              text:
                  'Pagamento em dinheiro · cobrar ${formatCents(offer.cashCollectionAmountCents!)}',
            ),
          ],
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: busy || expired ? null : onReject,
                    child: const Text('Recusar'),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 52,
                  child: FilledButton(
                    onPressed: busy || expired ? null : onAccept,
                    style: FilledButton.styleFrom(
                      backgroundColor: RamoColors.brandBlack,
                      foregroundColor: Colors.white,
                    ),
                    child: busy
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text(
                            'Aceitar corrida',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          ),
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

class _DriverRouteTimeline extends StatelessWidget {
  const _DriverRouteTimeline({
    required this.origin,
    required this.destination,
  });

  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Column(
        children: [
          _DriverRouteStop(
            icon: Icons.radio_button_checked_rounded,
            label: 'EMBARQUE',
            value: origin,
          ),
          Padding(
            padding: const EdgeInsets.only(left: 9),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: 2,
                height: 18,
                color: Theme.of(context).dividerColor.withValues(alpha: .7),
              ),
            ),
          ),
          _DriverRouteStop(
            icon: Icons.location_on_rounded,
            label: 'DESTINO',
            value: destination,
          ),
        ],
      ),
    );
  }
}

class _DriverRouteStop extends StatelessWidget {
  const _DriverRouteStop({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: RamoColors.brandBlack),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: RamoColors.muted,
                  fontWeight: FontWeight.w900,
                  fontSize: 9,
                  letterSpacing: .7,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DriverTripMetrics extends StatelessWidget {
  const _DriverTripMetrics({
    required this.pickupDuration,
    required this.pickupDistance,
    required this.tripDuration,
    required this.tripDistance,
    required this.passengers,
  });

  final String? pickupDuration;
  final String pickupDistance;
  final String? tripDuration;
  final String? tripDistance;
  final int passengers;

  @override
  Widget build(BuildContext context) {
    final pickupText = pickupDuration == null
        ? pickupDistance
        : '$pickupDuration · $pickupDistance';
    final tripText = switch ((tripDuration, tripDistance)) {
      (final String duration, final String distance) =>
        '$duration · $distance',
      (final String duration, null) => duration,
      (null, final String distance) => distance,
      _ => 'Calculando',
    };

    return Row(
      children: [
        Expanded(
          child: _DriverMetric(
            icon: Icons.near_me_outlined,
            label: 'Até buscar',
            value: pickupText,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _DriverMetric(
            icon: Icons.route_rounded,
            label: 'Viagem',
            value: tripText,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _DriverMetric(
            icon: Icons.group_outlined,
            label: 'Pessoas',
            value: '$passengers',
          ),
        ),
      ],
    );
  }
}

class _DriverMetric extends StatelessWidget {
  const _DriverMetric({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: RamoColors.brandBlack),
          const SizedBox(height: 8),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: RamoColors.muted,
              fontWeight: FontWeight.w800,
              fontSize: 9,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverMetaPill extends StatelessWidget {
  const _DriverMetaPill({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverNoticeStrip extends StatelessWidget {
  const _DriverNoticeStrip({
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: RamoColors.brandBlack),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _NavigationInstructionBanner extends StatelessWidget {
  const _NavigationInstructionBanner({
    required this.route,
    required this.currentPosition,
    required this.targetLabel,
    required this.onStop,
    required this.onExternal,
  });

  final DriverRouteInfo? route;
  final LatLng currentPosition;
  final String targetLabel;
  final VoidCallback onStop;
  final VoidCallback onExternal;

  IconData _iconForType(int? type) {
    return switch (type) {
      7 || 8 => Icons.turn_left_rounded,
      9 || 10 => Icons.turn_right_rounded,
      15 || 16 => Icons.u_turn_left_rounded,
      17 || 18 => Icons.u_turn_right_rounded,
      26 || 27 => Icons.roundabout_left_rounded,
      _ => Icons.navigation_rounded,
    };
  }

  @override
  Widget build(BuildContext context) {
    final maneuver = route?.nextManeuverFor(currentPosition);
    final instruction =
        maneuver?.instruction ?? 'Calculando a próxima instrução…';
    final distanceLabel =
        maneuver?.distanceLabel ?? 'Navegação ativa';

    return Material(
      color: RamoColors.brandBlack,
      elevation: 8,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: RamoColors.brandYellow,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _iconForType(maneuver?.type),
                    color: RamoColors.brandBlack,
                    size: 28,
                  ),
                ),
                const SizedBox(width: RamoSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        distanceLabel,
                        style: const TextStyle(
                          color: RamoColors.brandYellow,
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        instruction,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                          height: 1.15,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: RamoSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    route == null
                        ? 'Destino: $targetLabel'
                        : '${route!.durationLabel} · '
                            '${route!.distanceLabel} · $targetLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Abrir no Google Maps',
                  onPressed: onExternal,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.open_in_new_rounded,
                    color: Colors.white,
                  ),
                ),
                IconButton(
                  tooltip: 'Encerrar navegação',
                  onPressed: onStop,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.close_rounded,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveRideCompactBar extends StatelessWidget {
  const _ActiveRideCompactBar({
    super.key,
    required this.ride,
    required this.onExpand,
    required this.onChat,
    this.route,
  });

  final AcceptedDriverRide ride;
  final DriverRouteInfo? route;
  final VoidCallback onExpand;
  final VoidCallback onChat;

  String get _target => ride.state == 'IN_PROGRESS'
      ? ride.destination.displayName
      : ride.origin.displayName;

  IconData get _icon => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' =>
          Icons.person_pin_circle_rounded,
        'DRIVER_ARRIVED' => Icons.hail_rounded,
        'IN_PROGRESS' => Icons.flag_rounded,
        _ => Icons.route_rounded,
      };

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomRight,
      child: Material(
        color: RamoColors.brandBlack,
        elevation: 8,
        borderRadius: BorderRadius.circular(RamoRadius.pill),
        child: InkWell(
          onTap: onExpand,
          borderRadius: BorderRadius.circular(RamoRadius.pill),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 9, 10, 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: const BoxDecoration(
                    color: RamoColors.brandYellow,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _icon,
                    size: 20,
                    color: RamoColors.brandBlack,
                  ),
                ),
                const SizedBox(width: 10),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 190),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route == null
                            ? 'Corrida ativa'
                            : '${route!.durationLabel} · ${route!.distanceLabel}',
                        style: const TextStyle(
                          color: RamoColors.brandYellow,
                          fontWeight: FontWeight.w900,
                          fontSize: 11,
                        ),
                      ),
                      Text(
                        _target,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  tooltip: 'Mensagem com passageiro',
                  onPressed: onChat,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.chat_bubble_outline_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
                IconButton(
                  tooltip: 'Expandir corrida',
                  onPressed: onExpand,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.expand_less_rounded,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActiveRideCard extends StatelessWidget {
  const _ActiveRideCard({
    super.key,
    required this.ride,
    required this.busy,
    required this.navigationActive,
    required this.onNavigate,
    required this.onStopNavigation,
    required this.onExternalNavigation,
    required this.onArrived,
    required this.onStart,
    required this.onComplete,
    required this.onChat,
    required this.currentPosition,
    this.onMinimize,
    this.route,
  });

  final AcceptedDriverRide ride;
  final bool busy;
  final bool navigationActive;
  final VoidCallback onNavigate;
  final VoidCallback onStopNavigation;
  final VoidCallback onExternalNavigation;
  final VoidCallback onArrived;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final VoidCallback onChat;
  final LatLng currentPosition;
  final VoidCallback? onMinimize;
  final DriverRouteInfo? route;

  String get _title => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'A caminho do embarque',
        'DRIVER_ARRIVED' => 'Você chegou',
        'IN_PROGRESS' => 'Corrida em andamento',
        'COMPLETED' => 'Corrida finalizada',
        _ => 'Corrida ativa',
      };

  String get _stageLabel => switch (ride.state) {
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'BUSCAR PASSAGEIRO',
        'DRIVER_ARRIVED' => 'NO EMBARQUE',
        'IN_PROGRESS' => 'EM VIAGEM',
        'COMPLETED' => 'FINALIZADA',
        _ => 'ATIVA',
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

  String get _categoryLabel => switch (ride.category) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => ride.category,
      };

  bool get _canNavigate =>
      ((ride.state == 'DRIVER_ASSIGNED' ||
              ride.state == 'DRIVER_ARRIVING') &&
          ride.pickupLatitude != null &&
          ride.pickupLongitude != null) ||
      (ride.state == 'IN_PROGRESS' &&
          ride.dropoffLatitude != null &&
          ride.dropoffLongitude != null);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: RamoElevation.floating(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: RamoColors.success,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  _title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                    letterSpacing: -.3,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.pill),
                ),
                child: Text(
                  _stageLabel,
                  style: const TextStyle(
                    color: RamoColors.muted,
                    fontWeight: FontWeight.w900,
                    fontSize: 9,
                    letterSpacing: .6,
                  ),
                ),
              ),
              if (onMinimize != null) ...[
                const SizedBox(width: 4),
                IconButton(
                  tooltip: 'Minimizar informações',
                  onPressed: onMinimize,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.expand_more_rounded),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          _DriverRouteTimeline(
            origin: ride.origin.displayName,
            destination: ride.destination.displayName,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _DriverMetric(
                  icon: Icons.schedule_rounded,
                  label: 'Tempo',
                  value: route?.durationLabel ?? 'Calculando',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DriverMetric(
                  icon: Icons.route_rounded,
                  label: 'Distância',
                  value: route?.distanceLabel ?? 'Calculando',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DriverMetric(
                  icon: Icons.group_outlined,
                  label: 'Pessoas',
                  value: '${ride.passengers}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _DriverMetaPill(
                icon: Icons.directions_car_filled_rounded,
                label: _categoryLabel,
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    'SEU GANHO',
                    style: TextStyle(
                      color: RamoColors.muted,
                      fontWeight: FontWeight.w900,
                      fontSize: 9,
                      letterSpacing: .7,
                    ),
                  ),
                  Text(
                    formatCents(ride.driverEarningsCents),
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (ride.isCash && ride.cashCollectionAmountCents != null) ...[
            const SizedBox(height: 12),
            _DriverNoticeStrip(
              icon: Icons.payments_outlined,
              text:
                  'Receber em dinheiro: ${formatCents(ride.cashCollectionAmountCents!)}',
            ),
          ],
          if (
            route?.nextManeuverFor(currentPosition) != null &&
            navigationActive
          ) ...[
            const SizedBox(height: 12),
            _DriverNoticeStrip(
              icon: Icons.navigation_rounded,
              text:
                  route!.nextManeuverFor(currentPosition)!.instruction,
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: OutlinedButton.icon(
              onPressed: onChat,
              icon: const Icon(Icons.chat_bubble_outline_rounded),
              label: const Text('Mensagem com passageiro'),
            ),
          ),
          if (_canNavigate) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                onPressed:
                    navigationActive ? onStopNavigation : onNavigate,
                icon: Icon(
                  navigationActive
                      ? Icons.close_rounded
                      : Icons.navigation_rounded,
                ),
                label: Text(
                  navigationActive
                      ? 'Parar navegação'
                      : ride.state == 'IN_PROGRESS'
                          ? 'Navegar até o destino'
                          : 'Navegar até o embarque',
                ),
              ),
            ),
            if (navigationActive) ...[
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: onExternalNavigation,
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: const Text('Abrir no Google Maps'),
                ),
              ),
            ],
          ],
          if (_actionLabel != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton(
                onPressed: busy ? null : _action,
                style: FilledButton.styleFrom(
                  backgroundColor: RamoColors.brandBlack,
                  foregroundColor: Colors.white,
                ),
                child: busy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        _actionLabel!,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
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


class _UnavailableDriverRouteService implements DriverRouteService {
  const _UnavailableDriverRouteService();

  @override
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) {
    return Future<DriverRouteInfo>.error(
      StateError(
        'O serviço de rotas exige conexão com o Core do Ramo Nessa.',
      ),
    );
  }
}
