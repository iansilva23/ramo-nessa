import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../home/presentation/widgets/ramo_live_map.dart';
import '../../map/data/route_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../data/passenger_ride_realtime_service.dart';
import '../data/passenger_ride_tracking_service.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import '../domain/prepared_ride.dart';
import 'passenger_ride_chat_screen.dart';
import 'widgets/animated_ride_status.dart';
import 'tracking_map_transition_policy.dart';
import 'passenger_cancellation_panel.dart';

class RideTrackingScreen extends StatefulWidget {
  const RideTrackingScreen({
    super.key,
    required this.rideId,
    required this.remainingWalletCents,
    required this.trackingService,
    this.paymentMethod,
    this.realtimeService,
    this.routeService,
    this.initialDispatchStatus,
    this.networkTilesEnabled = true,
  });

  final String rideId;
  final int? remainingWalletCents;
  final PassengerRideTrackingService trackingService;
  final String? paymentMethod;
  final PassengerRideRealtimeService? realtimeService;
  final RouteService? routeService;
  final String? initialDispatchStatus;
  final bool networkTilesEnabled;

  @override
  State<RideTrackingScreen> createState() => _RideTrackingScreenState();
}

class _RideTrackingScreenState extends State<RideTrackingScreen> {
  final RamoMapController _mapController = RamoMapController();
  Timer? _timer;
  StreamSubscription<PassengerRideTrackingSnapshot>? _realtimeSubscription;
  PassengerRideTrackingSnapshot? _snapshot;
  // A stale HTTP poll must never overwrite a more recent realtime event.
  int _snapshotRevision = 0;
  String? _error;
  bool _mapReady = false;
  bool _hasCenteredMap = false;
  String? _framedRouteStage;
  int _routeEpoch = 0;
  bool _requestInFlight = false;
  bool _routeRequestInFlight = false;
  DateTime? _lastRouteAttemptAt;
  String? _lastRouteState;
  RouteInfo? _route;
  int _ratingStars = 0;
  bool _ratingSubmitting = false;
  bool _ratingSubmitted = false;
  bool _recoveryAction = false;
  String? _ratingError;

  @override
  void initState() {
    super.initState();
    _refresh();
    _startRealtime();
    _timer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refresh(),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _realtimeSubscription?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  void _startRealtime() {
    final service = widget.realtimeService;
    if (service == null) return;

    _realtimeSubscription = service.watch(widget.rideId).listen(
      (snapshot) {
        if (!mounted || !TrackingMapTransitionPolicy.isExpectedRide(
          expectedRideId: widget.rideId,
          receivedRideId: snapshot.rideId,
        )) {
          return;
        }
        _applySnapshot(snapshot);
      },
      onError: (_) {
        // HTTP periódico continua como fallback.
      },
    );
  }

  String _routeStage(PassengerRideTrackingSnapshot snapshot) =>
      TrackingMapTransitionPolicy.stageFor(
        rideState: snapshot.state,
        terminal: snapshot.isTerminal,
      );

  void _fitTrackingRouteIfNeeded() {
    final snapshot = _snapshot;
    final route = _route;
    final driver = snapshot?.driverLocation;
    if (snapshot == null || route == null || driver == null ||
        !TrackingMapTransitionPolicy.isUsableGps(
          driver.latitude, driver.longitude,
        )) {
      return;
    }
    final stage = _routeStage(snapshot);
    final isDropoff = stage == 'to-dropoff';
    final targetLat = isDropoff
        ? snapshot.dropoffLatitude : snapshot.pickupLatitude;
    final targetLng = isDropoff
        ? snapshot.dropoffLongitude : snapshot.pickupLongitude;
    if (!TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: _mapReady,
      terminal: snapshot.isTerminal,
      hasDriver: true,
      hasTarget: TrackingMapTransitionPolicy.isUsableGps(
        targetLat, targetLng,
      ),
      routePointCount: route.points.length,
      stage: stage,
      lastFramedStage: _framedRouteStage,
    )) {
      return;
    }

    _framedRouteStage = stage;
    _hasCenteredMap = true;
    unawaited(_mapController.fitCoordinates(
      coordinates: [
        LatLng(driver.latitude, driver.longitude),
        ...route.points,
        LatLng(targetLat!, targetLng!),
      ],
      edgePadding: 20,
      maxZoom: 16.5,
    ));
  }

  void _applySnapshot(PassengerRideTrackingSnapshot snapshot) {
    if (!mounted) return;
    _snapshotRevision++;
    final old = _snapshot;
    final previousStage = old == null ? null : _routeStage(old);
    final currentStage = _routeStage(snapshot);
    final stageChanged =
        previousStage != null && previousStage != currentStage;

    if (stageChanged) {
      // Invalidate an in-flight route to the old pickup when the passenger
      // starts travelling to the destination (or the ride becomes terminal).
      _routeEpoch++;
      _lastRouteAttemptAt = null;
      _lastRouteState = null;
      _framedRouteStage = null;
    }
    setState(() {
      _snapshot = snapshot;
      if (stageChanged) _route = null;
      _error = null;
    });
    if (!snapshot.isTerminal) {
      unawaited(_refreshRoute(snapshot));
    }

    if (snapshot.isTerminal) {
      _timer?.cancel();
      _realtimeSubscription?.cancel();
    }

    final driver = snapshot.driverLocation;
    final center = driver != null &&
            TrackingMapTransitionPolicy.isUsableGps(
              driver.latitude, driver.longitude,
            )
        ? LatLng(driver.latitude, driver.longitude)
        : TrackingMapTransitionPolicy.isUsableGps(
            snapshot.pickupLatitude, snapshot.pickupLongitude,
          )
            ? LatLng(
                snapshot.pickupLatitude!,
                snapshot.pickupLongitude!,
              )
            : null;

    if (TrackingMapTransitionPolicy.shouldCenterInitially(
      mapReady: _mapReady,
      alreadyCentered: _hasCenteredMap,
      hasPosition: center != null,
    )) {
      _hasCenteredMap = true;
      unawaited(_mapController.move(center!, 15.5));
    }
    _fitTrackingRouteIfNeeded();
  }

  Future<void> _refreshRoute(PassengerRideTrackingSnapshot snapshot) async {
    final service = widget.routeService;
    final driver = snapshot.driverLocation;
    if (service == null || driver == null || driver.stale ||
        !TrackingMapTransitionPolicy.isUsableGps(
          driver.latitude, driver.longitude,
        ) || _routeRequestInFlight) {
      return;
    }
    final useDropoff = snapshot.state == 'IN_PROGRESS';
    final targetLatitude =
        useDropoff ? snapshot.dropoffLatitude : snapshot.pickupLatitude;
    final targetLongitude =
        useDropoff ? snapshot.dropoffLongitude : snapshot.pickupLongitude;
    if (targetLatitude == null || targetLongitude == null ||
        !TrackingMapTransitionPolicy.isUsableGps(
          targetLatitude, targetLongitude,
        )) {
      return;
    }
    final now = DateTime.now();
    if (_lastRouteState == snapshot.state &&
        _lastRouteAttemptAt != null &&
        now.difference(_lastRouteAttemptAt!) < const Duration(seconds: 8)) {
      return;
    }
    final requestEpoch = _routeEpoch;
    final requestedStage = _routeStage(snapshot);
    _routeRequestInFlight = true;
    _lastRouteAttemptAt = now;
    _lastRouteState = snapshot.state;
    try {
      final route = await service.route(
        origin: LatLng(driver.latitude, driver.longitude),
        destination: LatLng(targetLatitude, targetLongitude),
      );
      final latest = _snapshot;
      if (!mounted || latest == null ||
          !TrackingMapTransitionPolicy.isCurrentRouteResponse(
            requestEpoch: requestEpoch,
            latestEpoch: _routeEpoch,
            requestedStage: requestedStage,
            latestStage: _routeStage(latest),
          )) {
        return;
      }
      setState(() => _route = route);
      _fitTrackingRouteIfNeeded();
    } catch (_) {
      // A telemetria continua visível; uma nova tentativa acontece no próximo
      // ciclo sem transformar falha do provedor em localização falsa.
    } finally {
      _routeRequestInFlight = false;
      // The ride might have started while the old pickup route was pending.
      // Refresh with the new destination as soon as the old call finishes.
      if (mounted && requestEpoch != _routeEpoch) {
        final latest = _snapshot;
        if (latest != null && !latest.isTerminal) {
          unawaited(_refreshRoute(latest));
        }
      }
    }
  }

  Future<void> _refresh() async {
    if (_requestInFlight) return;
    _requestInFlight = true;
    final revisionAtRequest = _snapshotRevision;

    try {
      final snapshot = await widget.trackingService.tracking(widget.rideId);
      if (!mounted || revisionAtRequest != _snapshotRevision ||
          !TrackingMapTransitionPolicy.isExpectedRide(
            expectedRideId: widget.rideId,
            receivedRideId: snapshot.rideId,
          )) {
        return;
      }
      _applySnapshot(snapshot);
    } on PassengerRideTrackingException catch (error) {
      if (!mounted || revisionAtRequest != _snapshotRevision) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted || revisionAtRequest != _snapshotRevision) return;
      setState(() {
        _error = 'Não conseguimos atualizar a localização agora.';
      });
    } finally {
      _requestInFlight = false;
    }
  }

  PassengerRideRecoveryService? get _recoveryService {
    final service = widget.trackingService;
    if (service is PassengerRideRecoveryService) {
      return service as PassengerRideRecoveryService;
    }
    return null;
  }

  Future<void> _retryDriverSearch() async {
    final service = _recoveryService;
    if (service == null || _recoveryAction) return;

    setState(() {
      _recoveryAction = true;
      _error = null;
    });
    try {
      final result = await service.retryDriverSearch(widget.rideId);
      if (!mounted) return;
      setState(() {
        _error = result.dispatchStatus == 'NO_DRIVER_FOUND'
            ? 'Ainda não encontramos motorista. Você pode tentar novamente ou cancelar a corrida.'
            : null;
      });
      await _refresh();
    } on PassengerRideTrackingException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Não conseguimos procurar outro motorista agora.';
      });
    } finally {
      if (mounted) {
        setState(() => _recoveryAction = false);
      } else {
        _recoveryAction = false;
      }
    }
  }

  Future<void> _cancelNoDriverSearch() async {
    final service = _recoveryService;
    if (service == null || _recoveryAction) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancelar corrida?'),
        content: const Text(
          'Vamos encerrar a busca e devolver integralmente o pagamento. '
          'No Pix ou cartão, o prazo para aparecer na conta depende do banco.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Continuar buscando'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Cancelar e reembolsar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _recoveryAction = true;
      _error = null;
    });
    try {
      final result = await service.cancelSearch(widget.rideId);
      if (!mounted) return;
      await _refresh();
      if (!mounted) return;
      final message = switch (result.refundStatus) {
        'refunded' => 'Corrida cancelada. Seu pagamento foi devolvido.',
        'not_charged' => 'Corrida cancelada. Nenhum valor foi cobrado.',
        _ => 'Corrida cancelada. Seu reembolso está em processamento.',
      };
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    } on PassengerRideTrackingException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Não conseguimos cancelar a corrida agora.';
      });
    } finally {
      if (mounted) {
        setState(() => _recoveryAction = false);
      } else {
        _recoveryAction = false;
      }
    }
  }

  Future<void> _openRideChat() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PassengerRideChatScreen(
          service: widget.trackingService,
          rideId: widget.rideId,
        ),
      ),
    );
  }

  Future<void> _submitDriverRating() async {
    if (_ratingStars < 1 || _ratingStars > 5 || _ratingSubmitting) {
      return;
    }

    setState(() {
      _ratingSubmitting = true;
      _ratingError = null;
    });

    try {
      final result = await widget.trackingService.rateDriver(
        widget.rideId,
        _ratingStars,
      );
      if (!mounted) return;
      setState(() {
        _ratingStars = result.stars;
        _ratingSubmitting = false;
        _ratingSubmitted = true;
      });
      await _refresh();
    } on PassengerRideTrackingException catch (error) {
      if (!mounted) return;
      setState(() {
        _ratingSubmitting = false;
        _ratingError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _ratingSubmitting = false;
        _ratingError = 'Não conseguimos enviar sua avaliação agora.';
      });
    }
  }

  String get _status {
    final state = _snapshot?.state;
    return switch (state) {
      'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' =>
        'Seu motorista está a caminho',
      'DRIVER_ARRIVED' => 'Seu motorista chegou',
      'IN_PROGRESS' => 'Corrida em andamento',
      'COMPLETED' => 'Corrida finalizada',
      'NO_DRIVER_FOUND' => 'Nenhum motorista disponível nesta rodada',
      'CANCELLED_BY_PASSENGER' ||
      'CANCELLED_BY_DRIVER' ||
      'CANCELLED_BY_ADMIN' =>
        'Corrida cancelada',
      'REFUND_PENDING' => 'Estorno em processamento',
      'REFUNDED' => 'Pagamento devolvido',
      'PAID' || 'SEARCHING_DRIVER' => 'Procurando motorista',
      _ => switch (widget.initialDispatchStatus) {
        'SEARCHING_DRIVER' => 'Procurando motorista',
        'NO_DRIVER_FOUND' => 'Nenhum motorista disponível nesta rodada',
        _ => 'Pagamento confirmado',
      },
    };
  }

  RamoPlace? _pickup(PassengerRideTrackingSnapshot? snapshot) {
    final latitude = snapshot?.pickupLatitude;
    final longitude = snapshot?.pickupLongitude;
    if (latitude == null || longitude == null ||
        !TrackingMapTransitionPolicy.isUsableGps(latitude, longitude)) {
      return null;
    }

    return RamoPlace(
      name: 'Embarque',
      address: 'Ponto de embarque da corrida',
      position: LatLng(latitude, longitude),
    );
  }

  RamoPlace? _dropoff(PassengerRideTrackingSnapshot? snapshot) {
    final latitude = snapshot?.dropoffLatitude;
    final longitude = snapshot?.dropoffLongitude;
    if (latitude == null || longitude == null ||
        !TrackingMapTransitionPolicy.isUsableGps(latitude, longitude)) {
      return null;
    }

    return RamoPlace(
      name: 'Destino',
      address: 'Destino da corrida',
      position: LatLng(latitude, longitude),
    );
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final driver = snapshot?.driverLocation;
    final driverProfile = snapshot?.driver;
    final driverPosition = driver == null ||
            !TrackingMapTransitionPolicy.isUsableGps(
              driver.latitude, driver.longitude,
            )
        ? null
        : LatLng(driver.latitude, driver.longitude);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sua corrida'),
      ),
      body: Column(
        children: [
          Expanded(
            child: RamoLiveMap(
              controller: _mapController,
              origin: _pickup(snapshot),
              destination: _dropoff(snapshot),
              routePoints: _route?.points ?? const [],
              routePhase: snapshot == null ? null : _routeStage(snapshot),
              driverPosition: driverPosition,
              driverCategory: snapshot?.category,
              driverPositionStale: driver?.stale == true ||
                  (driver != null && driverPosition == null),
              networkTilesEnabled: widget.networkTilesEnabled,
              onMapReady: () {
                _mapReady = true;
                _fitTrackingRouteIfNeeded();
                _refresh();
              },
            ),
          ),
          SafeArea(
            top: false,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * .64,
              ),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  boxShadow: RamoElevation.floating(context),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.check_circle_rounded,
                        color: RamoColors.signal,
                      ),
                      const SizedBox(width: RamoSpacing.xs),
                      Expanded(
                        child: Text(
                          widget.paymentMethod == 'cash'
                              ? 'Pagamento em dinheiro'
                              : _snapshot?.state == 'REFUNDED'
                                  ? 'Pagamento devolvido'
                                  : _snapshot?.state == 'REFUND_PENDING'
                                      ? 'Estorno solicitado'
                                      : 'Pagamento confirmado',
                          softWrap: true,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  AnimatedRideStatus(label: _status),
                  if (driverProfile != null) ...[
                    const SizedBox(height: RamoSpacing.md),
                    _AssignedDriverCard(driver: driverProfile),
                  ],
                  if ({
                    'DRIVER_ASSIGNED',
                    'DRIVER_ARRIVING',
                    'DRIVER_ARRIVED',
                    'IN_PROGRESS',
                  }.contains(snapshot?.state)) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _openRideChat,
                        icon: RamoUnreadChatIcon(
                          api: widget.trackingService, rideId: widget.rideId,
                        ),
                        label: const Text('Mensagem com motorista'),
                      ),
                    ),
                  ],
                  if (widget.trackingService is PassengerManualCancellationApi)
                    PassengerCancellationPanel(rideId:widget.rideId,api:widget.trackingService as PassengerManualCancellationApi,onChanged:()=>unawaited(_refresh())),
                  if (snapshot?.state == 'NO_DRIVER_FOUND') ...[
                    const SizedBox(height: RamoSpacing.md),
                    Text(
                      'Seu pagamento continua protegido. Você pode tentar uma nova busca sem pagar novamente. Se cancelar, acompanhe a devolução pelo app.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: RamoSpacing.sm),
                    Row(
                      children: [
                        Flexible(
                          flex: 2,
                          child: OutlinedButton(
                            onPressed:
                                _recoveryAction || _recoveryService == null
                                    ? null
                                    : _retryDriverSearch,
                            child: const Text('Tentar novamente'),
                          ),
                        ),
                        const SizedBox(width: RamoSpacing.sm),
                        if (widget.trackingService is! PassengerManualCancellationApi) Expanded(
                          flex: 3,
                          child: FilledButton(
                            onPressed:
                                _recoveryAction || _recoveryService == null
                                    ? null
                                    : _cancelNoDriverSearch,
                            child: _recoveryAction
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('Cancelar corrida'),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (snapshot?.state == 'COMPLETED' &&
                      driverProfile != null) ...[
                    const SizedBox(height: RamoSpacing.md),
                    _DriverRatingPanel(
                      stars: _ratingStars,
                      submitting: _ratingSubmitting,
                      submitted: _ratingSubmitted,
                      error: _ratingError,
                      onChanged: (stars) {
                        if (_ratingSubmitting || _ratingSubmitted) return;
                        setState(() => _ratingStars = stars);
                      },
                      onSubmit: _submitDriverRating,
                    ),
                  ],
                  if (driver?.stale == true ||
                      (driver != null && driverPosition == null)) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      driverPosition == null
                          ? 'A posição do motorista está indisponível no momento.'
                          : 'A última posição do motorista está desatualizada.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      _error!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.error,
                          ),
                    ),
                  ],
                  if (widget.remainingWalletCents != null) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      'Saldo restante: '
                      '${PreparedRide.formatCents(widget.remainingWalletCents!)}',
                    ),
                  ],
                  if (widget.paymentMethod == 'cash') ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      'Pague diretamente ao motorista no fim da corrida.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (snapshot?.isTerminal == true) ...[
                    const SizedBox(height: RamoSpacing.md),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => Navigator.of(context)
                            .popUntil((route) => route.isFirst),
                        child: const Text('Voltar ao início'),
                      ),
                    ),
                  ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}


class _DriverRatingPanel extends StatelessWidget {
  const _DriverRatingPanel({
    required this.stars,
    required this.submitting,
    required this.submitted,
    required this.onChanged,
    required this.onSubmit,
    this.error,
  });

  final int stars;
  final bool submitting;
  final bool submitted;
  final ValueChanged<int> onChanged;
  final VoidCallback onSubmit;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(RamoRadius.md),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: .45),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            submitted ? 'Avaliação enviada' : 'Como foi sua corrida?',
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            submitted
                ? 'Obrigado por avaliar seu motorista.'
                : 'Sua avaliação ajuda a manter a qualidade do Ramo Nessa.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: RamoSpacing.sm),
          Row(
            children: List.generate(5, (index) {
              final value = index + 1;
              return IconButton(
                tooltip:
                    value == 1 ? '1 estrela' : '$value estrelas',
                onPressed:
                    submitting || submitted ? null : () => onChanged(value),
                icon: Icon(
                  value <= stars
                      ? Icons.star_rounded
                      : Icons.star_border_rounded,
                  color: RamoColors.brandYellow,
                  size: 32,
                ),
              );
            }),
          ),
          if (error != null) ...[
            const SizedBox(height: RamoSpacing.xs),
            Text(
              error!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 12,
              ),
            ),
          ],
          if (!submitted) ...[
            const SizedBox(height: RamoSpacing.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed:
                    stars > 0 && !submitting ? onSubmit : null,
                child: submitting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Enviar avaliação'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}


class _AssignedDriverCard extends StatelessWidget {
 const _AssignedDriverCard({required this.driver});
 final PassengerDriverProfile driver;
 String? get _photoUrl{
  final path=driver.photoPath?.trim(),base=RamoCoreConfig.baseUri;
  return path==null||path.isEmpty||base==null?null:base.resolve(path).toString();
 }
 @override Widget build(BuildContext context){
  final photo=_photoUrl;
  final vehicle=[driver.vehicleMake,driver.vehicleModel].whereType<String>().where((s)=>s.trim().isNotEmpty).join(' ');
  final plate=driver.vehiclePlate?.trim();
  return Container(
   padding:const EdgeInsets.all(RamoSpacing.md),
   decoration:BoxDecoration(color:Theme.of(context).colorScheme.surfaceContainerHighest,borderRadius:BorderRadius.circular(18)),
   child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Row(children:[
     CircleAvatar(radius:28,backgroundColor:RamoColors.brandYellow,foregroundColor:RamoColors.brandBlack,
      backgroundImage:photo==null?null:NetworkImage(photo),child:photo==null?const Icon(Icons.person_rounded,size:30):null),
     const SizedBox(width:12),
     Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(driver.displayName,style:const TextStyle(fontSize:17,fontWeight:FontWeight.w900)),
      FittedBox(fit:BoxFit.scaleDown,alignment:Alignment.centerLeft,child:Row(mainAxisSize:MainAxisSize.min,children:[const Icon(Icons.star_rounded,color:RamoColors.brandYellow,size:19),const SizedBox(width:4),
       Text(driver.ratingAverage==null?'Novo motorista':driver.ratingAverage!.toStringAsFixed(2),maxLines:1,style:const TextStyle(fontWeight:FontWeight.w800))])),
     ])),
     if(plate!=null&&plate.isNotEmpty)...[
      const SizedBox(width:8),Column(children:[
       const Text('PLACA',style:TextStyle(fontSize:10,fontWeight:FontWeight.w700)),
       Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:7),
        decoration:BoxDecoration(color:Colors.white,border:Border.all(color:Colors.black,width:1.5),borderRadius:BorderRadius.circular(8)),
        child:Text(plate,style:const TextStyle(color:Colors.black,fontSize:18,fontWeight:FontWeight.w900))),
      ]),
     ],
    ]),
    if(vehicle.isNotEmpty)...[const SizedBox(height:10),Text('$vehicle${driver.vehicleColor?.trim().isNotEmpty==true?' · ${driver.vehicleColor!}':''}',style:const TextStyle(fontWeight:FontWeight.w700))],
    if(plate!=null&&plate.isNotEmpty)...[const SizedBox(height:6),Text('Confira o nome e a placa antes de embarcar.',style:TextStyle(fontSize:12,color:Theme.of(context).colorScheme.onSurfaceVariant))],
   ]));
 }
}
