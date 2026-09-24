import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../home/presentation/widgets/ramo_live_map.dart';
import '../../map/domain/ramo_place.dart';
import '../data/passenger_ride_realtime_service.dart';
import '../data/passenger_ride_tracking_service.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import '../domain/prepared_ride.dart';

class RideTrackingScreen extends StatefulWidget {
  const RideTrackingScreen({
    super.key,
    required this.rideId,
    required this.remainingWalletCents,
    required this.trackingService,
    this.paymentMethod,
    this.realtimeService,
    this.initialDispatchStatus,
    this.networkTilesEnabled = true,
  });

  final String rideId;
  final int? remainingWalletCents;
  final PassengerRideTrackingService trackingService;
  final String? paymentMethod;
  final PassengerRideRealtimeService? realtimeService;
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
  String? _error;
  bool _mapReady = false;
  bool _requestInFlight = false;

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
        if (!mounted) return;
        _applySnapshot(snapshot);
      },
      onError: (_) {
        // HTTP periódico continua como fallback.
      },
    );
  }

  void _applySnapshot(PassengerRideTrackingSnapshot snapshot) {
    if (!mounted) return;

    setState(() {
      _snapshot = snapshot;
      _error = null;
    });

    if (snapshot.isTerminal) {
      _timer?.cancel();
      _realtimeSubscription?.cancel();
    }

    final driver = snapshot.driverLocation;
    final center = driver != null
        ? LatLng(driver.latitude, driver.longitude)
        : snapshot.pickupLatitude != null &&
                snapshot.pickupLongitude != null
            ? LatLng(
                snapshot.pickupLatitude!,
                snapshot.pickupLongitude!,
              )
            : null;

    if (_mapReady && center != null) {
      unawaited(_mapController.move(center, 15.5));
    }
  }

  Future<void> _refresh() async {
    if (_requestInFlight) return;
    _requestInFlight = true;

    try {
      final snapshot = await widget.trackingService.tracking(widget.rideId);
      if (!mounted) return;
      _applySnapshot(snapshot);
    } on PassengerRideTrackingException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Não conseguimos atualizar a localização agora.';
      });
    } finally {
      _requestInFlight = false;
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
    if (latitude == null || longitude == null) return null;

    return RamoPlace(
      name: 'Embarque',
      address: 'Ponto de embarque da corrida',
      position: LatLng(latitude, longitude),
    );
  }

  RamoPlace? _dropoff(PassengerRideTrackingSnapshot? snapshot) {
    final latitude = snapshot?.dropoffLatitude;
    final longitude = snapshot?.dropoffLongitude;
    if (latitude == null || longitude == null) return null;

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
    final driverPosition = driver == null
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
              routePoints: const [],
              driverPosition: driverPosition,
              driverPositionStale: driver?.stale ?? false,
              networkTilesEnabled: widget.networkTilesEnabled,
              onMapReady: () {
                _mapReady = true;
                _refresh();
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(RamoSpacing.lg),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                boxShadow: RamoElevation.floating(context),
              ),
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
                      Text(
                        widget.paymentMethod == 'cash'
                            ? 'Pagamento em dinheiro'
                            : _snapshot?.state == 'REFUNDED'
                                ? 'Pagamento devolvido'
                                : _snapshot?.state == 'REFUND_PENDING'
                                    ? 'Estorno solicitado'
                                    : 'Pagamento confirmado',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  Text(
                    _status,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  if (driverProfile != null) ...[
                    const SizedBox(height: RamoSpacing.md),
                    _AssignedDriverCard(driver: driverProfile),
                  ],
                  if (driver?.stale == true) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      'A última posição do motorista está desatualizada.',
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
        ],
      ),
    );
  }
}


class _AssignedDriverCard extends StatelessWidget {
  const _AssignedDriverCard({required this.driver});

  final PassengerDriverProfile driver;

  String? get _photoUrl {
    final path = driver.photoPath?.trim();
    final base = RamoCoreConfig.baseUri;
    if (path == null || path.isEmpty || base == null) return null;
    return base.resolve(path).toString();
  }

  @override
  Widget build(BuildContext context) {
    final photoUrl = _photoUrl;
    final rating = driver.ratingAverage;

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: RamoColors.brandYellow,
            foregroundColor: RamoColors.brandBlack,
            backgroundImage:
                photoUrl == null ? null : NetworkImage(photoUrl),
            child: photoUrl == null
                ? const Icon(Icons.person_rounded, size: 30)
                : null,
          ),
          const SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  driver.displayName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(
                      Icons.star_rounded,
                      size: 18,
                      color: RamoColors.brandYellow,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      rating == null
                          ? 'Novo motorista'
                          : rating.toStringAsFixed(2),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (driver.ratingCount > 0) ...[
                      const SizedBox(width: 4),
                      Text(
                        '(' + driver.ratingCount.toString() + ')',
                        style: const TextStyle(
                          color: RamoColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.verified_rounded, size: 20),
        ],
      ),
    );
  }
}
