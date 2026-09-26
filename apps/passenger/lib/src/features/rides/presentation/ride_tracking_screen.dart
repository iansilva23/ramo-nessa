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
import 'passenger_ride_chat_screen.dart';

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
  int _ratingStars = 0;
  bool _ratingSubmitting = false;
  bool _ratingSubmitted = false;
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
                        icon: const Icon(
                          Icons.chat_bubble_outline_rounded,
                        ),
                        label: const Text('Mensagem com motorista'),
                      ),
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
            style: const TextStyle(color: RamoColors.muted),
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
                        '(${driver.ratingCount})',
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
