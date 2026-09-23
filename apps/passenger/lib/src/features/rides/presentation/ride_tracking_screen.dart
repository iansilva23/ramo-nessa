import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_map_config.dart';
import '../../rides/data/passenger_ride_tracking_service.dart';
import '../../rides/domain/passenger_ride_tracking_snapshot.dart';
import '../../rides/domain/prepared_ride.dart';

class RideTrackingScreen extends StatefulWidget {
  const RideTrackingScreen({
    super.key,
    required this.rideId,
    required this.remainingWalletCents,
    required this.trackingService,
    this.initialDispatchStatus,
    this.networkTilesEnabled = true,
  });

  final String rideId;
  final int remainingWalletCents;
  final PassengerRideTrackingService trackingService;
  final String? initialDispatchStatus;
  final bool networkTilesEnabled;

  @override
  State<RideTrackingScreen> createState() => _RideTrackingScreenState();
}

class _RideTrackingScreenState extends State<RideTrackingScreen> {
  final MapController _mapController = MapController();
  Timer? _timer;
  PassengerRideTrackingSnapshot? _snapshot;
  String? _error;
  bool _mapReady = false;
  bool _requestInFlight = false;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _refresh(),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_requestInFlight) return;
    _requestInFlight = true;

    try {
      final snapshot = await widget.trackingService.tracking(widget.rideId);
      if (!mounted) return;

      setState(() {
        _snapshot = snapshot;
        _error = null;
      });

      if (snapshot.isTerminal) {
        _timer?.cancel();
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
        _mapController.move(center, 15.5);
      }
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
      'REFUNDED' => 'Pagamento devolvido',
      'PAID' || 'SEARCHING_DRIVER' => 'Procurando motorista',
      _ => switch (widget.initialDispatchStatus) {
        'SEARCHING_DRIVER' => 'Procurando motorista',
        'NO_DRIVER_FOUND' => 'Nenhum motorista disponível nesta rodada',
        _ => 'Pagamento confirmado',
      },
    };
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final markers = <Marker>[];

    if (
      snapshot?.pickupLatitude != null &&
      snapshot?.pickupLongitude != null
    ) {
      markers.add(
        Marker(
          point: LatLng(
            snapshot!.pickupLatitude!,
            snapshot.pickupLongitude!,
          ),
          width: 44,
          height: 44,
          child: const _PickupMarker(),
        ),
      );
    }

    if (
      snapshot?.dropoffLatitude != null &&
      snapshot?.dropoffLongitude != null
    ) {
      markers.add(
        Marker(
          point: LatLng(
            snapshot!.dropoffLatitude!,
            snapshot.dropoffLongitude!,
          ),
          width: 44,
          height: 44,
          child: const _DropoffMarker(),
        ),
      );
    }

    final driver = snapshot?.driverLocation;
    if (driver != null) {
      markers.add(
        Marker(
          point: LatLng(driver.latitude, driver.longitude),
          width: 52,
          height: 52,
          child: _DriverMarker(stale: driver.stale),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sua corrida'),
      ),
      body: Column(
        children: [
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: RamoMapConfig.fallbackCenter,
                initialZoom: RamoMapConfig.fallbackZoom,
                minZoom: 4,
                maxZoom: 19,
                backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                onMapReady: () {
                  _mapReady = true;
                  _refresh();
                },
              ),
              children: [
                if (widget.networkTilesEnabled)
                  TileLayer(
                    urlTemplate: RamoMapConfig.osmTileUrl,
                    userAgentPackageName: 'br.com.ramonessa.passenger',
                    tileProvider: NetworkTileProvider(
                      headers: const {
                        'User-Agent': RamoMapConfig.userAgent,
                      },
                    ),
                  ),
                if (markers.isNotEmpty) MarkerLayer(markers: markers),
              ],
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
                  const Row(
                    children: [
                      Icon(
                        Icons.check_circle_rounded,
                        color: RamoColors.signal,
                      ),
                      SizedBox(width: RamoSpacing.xs),
                      Text(
                        'Pagamento confirmado',
                        style: TextStyle(fontWeight: FontWeight.w800),
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
                  const SizedBox(height: RamoSpacing.sm),
                  Text(
                    'Saldo restante: '
                    '${PreparedRide.formatCents(widget.remainingWalletCents)}',
                  ),
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

class _PickupMarker extends StatelessWidget {
  const _PickupMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: RamoColors.signal,
        shape: BoxShape.circle,
        border: Border.all(color: RamoColors.ink, width: 3),
      ),
      child: const Icon(Icons.person_pin_circle_rounded, size: 24),
    );
  }
}

class _DropoffMarker extends StatelessWidget {
  const _DropoffMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: RamoColors.ink,
        shape: BoxShape.circle,
      ),
      child: const Icon(
        Icons.flag_rounded,
        color: RamoColors.signal,
        size: 24,
      ),
    );
  }
}

class _DriverMarker extends StatelessWidget {
  const _DriverMarker({required this.stale});

  final bool stale;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: stale
            ? Theme.of(context).colorScheme.outline
            : RamoColors.ink,
        shape: BoxShape.circle,
        border: Border.all(color: RamoColors.signal, width: 4),
        boxShadow: RamoElevation.floating(context),
      ),
      child: const Icon(
        Icons.directions_car_filled_rounded,
        color: RamoColors.signal,
        size: 26,
      ),
    );
  }
}
