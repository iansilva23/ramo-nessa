import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/driver_core_config.dart';
import '../../../core/location/device_driver_location_service.dart';
import '../../../core/location/driver_location_service.dart';
import '../data/driver_api.dart';
import '../data/http_driver_api.dart';
import '../domain/driver_models.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    this.api,
    this.locationService,
  });

  final DriverApi? api;
  final DriverLocationService? locationService;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  late final DriverApi? _api = widget.api ??
      (DriverCoreConfig.enabled
          ? HttpDriverApi(
              baseUrl: Uri.parse(DriverCoreConfig.baseUrl),
              driverId: DriverCoreConfig.devDriverId,
            )
          : null);

  late final DriverLocationService _location =
      widget.locationService ?? DeviceDriverLocationService();

  DriverSupplySnapshot? _supply;
  DriverOffer? _offer;
  AcceptedDriverRide? _activeRide;
  bool _loading = true;
  bool _changingStatus = false;
  bool _offerAction = false;
  bool _rideAction = false;
  String? _message;
  Timer? _pollTimer;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _ticker?.cancel();
    super.dispose();
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
      if (!mounted) return;
      setState(() {
        _supply = supply;
        _loading = false;
        _message = null;
      });

      if (supply.busy) {
        final ride = await api.currentRide();
        if (!mounted) return;
        setState(() => _activeRide = ride);
      } else if (supply.online) {
        _startPolling();
        await _refreshOffer();
      }
    } on DriverApiException catch (error) {
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
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _offerAction = false;
        _message = error.message;
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
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = error.message;
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
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _rideAction = false;
        _message = error.message;
      });
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
    }
  }

  @override
  Widget build(BuildContext context) {
    final supply = _supply;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const RamoBrandLockup(compact: true),
            const SizedBox(width: RamoSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: RamoSpacing.sm,
                vertical: RamoSpacing.xxs,
              ),
              decoration: BoxDecoration(
                color: RamoColors.brandBlack,
                borderRadius: BorderRadius.circular(RamoRadius.pill),
              ),
              child: const Text(
                'MOTORISTA',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .8,
                ),
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(RamoSpacing.lg),
                  children: [
                    if (_message != null) ...[
                      _MessageCard(message: _message!),
                      const SizedBox(height: RamoSpacing.md),
                    ],
                    if (supply != null) ...[
                      _DriverStatusCard(
                        supply: supply,
                        changing: _changingStatus,
                        onToggle: _setOnline,
                        onUpdateLocation: _updateLocation,
                      ),
                      const SizedBox(height: RamoSpacing.lg),
                      if (_activeRide != null)
                        _ActiveRideCard(
                          ride: _activeRide!,
                          busy: _rideAction,
                          onArrived: _markArrived,
                          onStart: _startRide,
                          onComplete: _completeRide,
                        )
                      else if (!supply.online)
                        const _WaitingCard(
                          icon: Icons.power_settings_new_rounded,
                          title: 'Você está offline',
                          subtitle:
                              'Fique online para começar a receber corridas.',
                        )
                      else if (supply.busy)
                        const _WaitingCard(
                          icon: Icons.directions_car_filled_rounded,
                          title: 'Corrida em andamento',
                          subtitle:
                              'Finalize a corrida atual antes de receber outra.',
                        )
                      else if (_offer != null)
                        _OfferCard(
                          offer: _offer!,
                          busy: _offerAction,
                          onAccept: _acceptOffer,
                          onReject: _rejectOffer,
                        )
                      else
                        const _WaitingCard(
                          icon: Icons.radar_rounded,
                          title: 'Procurando corridas por perto',
                          subtitle:
                              'Mantenha o app aberto nesta primeira versão de testes.',
                        ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }
}

class _DriverStatusCard extends StatelessWidget {
  const _DriverStatusCard({
    required this.supply,
    required this.changing,
    required this.onToggle,
    required this.onUpdateLocation,
  });

  final DriverSupplySnapshot supply;
  final bool changing;
  final ValueChanged<bool> onToggle;
  final VoidCallback onUpdateLocation;

  @override
  Widget build(BuildContext context) {
    final categories = supply.categories.map(_categoryLabel).join(' · ');
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        boxShadow: RamoElevation.floating(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      supply.online ? 'Online' : 'Offline',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                          ),
                    ),
                    Text(
                      supply.busy ? 'Ocupado' : 'Disponível',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              Switch(
                value: supply.online,
                onChanged: changing || supply.busy ? null : onToggle,
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.md),
          Text(
            'Veículo aprovado: ${supply.vehicleId}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text('$categories · ${supply.seatCapacity} lugares'),
          if (supply.fourByFour)
            const Padding(
              padding: EdgeInsets.only(top: RamoSpacing.xs),
              child: Text(
                '4x4 aprovado para rotas elegíveis',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          const SizedBox(height: RamoSpacing.md),
          OutlinedButton.icon(
            onPressed: supply.online && !changing ? onUpdateLocation : null,
            icon: const Icon(Icons.my_location_rounded),
            label: const Text('Atualizar localização'),
          ),
        ],
      ),
    );
  }

  static String _categoryLabel(String value) => switch (value) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => value,
      };
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
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
        color: RamoColors.brandYellow,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Nova corrida',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: RamoColors.brandBlack,
                        fontWeight: FontWeight.w900,
                      ),
                ),
              ),
              Text(
                '${seconds}s',
                style: const TextStyle(
                  color: RamoColors.brandBlack,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.md),
          Text(
            formatCents(offer.driverEarningsCents),
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: RamoColors.brandBlack,
                  fontWeight: FontWeight.w900,
                ),
          ),
          const Text(
            'Você recebe',
            style: TextStyle(
              color: RamoColors.brandBlack,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: RamoSpacing.lg),
          Text(
            '${offer.origin.displayName} → ${offer.destination.displayName}',
            style: const TextStyle(
              color: RamoColors.brandBlack,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(
            '${offer.categoryLabel} · ${offer.passengers} '
            '${offer.passengers == 1 ? 'passageiro' : 'passageiros'}',
            style: const TextStyle(color: RamoColors.brandBlack),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(
            'Coleta a aprox. '
            '${offer.approximatePickupDistanceKm.toStringAsFixed(1)} km',
            style: const TextStyle(color: RamoColors.brandBlack),
          ),
          if (offer.pickupCompensationCents > 0) ...[
            const SizedBox(height: RamoSpacing.xs),
            Text(
              '+ ${formatCents(offer.pickupCompensationCents)} '
              'de coleta distante, integral para você',
              style: const TextStyle(
                color: RamoColors.brandBlack,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
          const SizedBox(height: RamoSpacing.xl),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy || expired ? null : onReject,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: RamoColors.brandBlack,
                    side: const BorderSide(color: RamoColors.brandBlack),
                  ),
                  child: const Text('Recusar'),
                ),
              ),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                child: FilledButton(
                  onPressed: busy || expired ? null : onAccept,
                  style: FilledButton.styleFrom(
                    backgroundColor: RamoColors.brandBlack,
                    foregroundColor: Colors.white,
                  ),
                  child: busy
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Aceitar'),
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
    required this.ride,
    required this.busy,
    required this.onArrived,
    required this.onStart,
    required this.onComplete,
  });

  final AcceptedDriverRide ride;
  final bool busy;
  final VoidCallback onArrived;
  final VoidCallback onStart;
  final VoidCallback onComplete;

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
          Text('Seu ganho: ${formatCents(ride.driverEarningsCents)}'),
          if (ride.pickupLatitude != null && ride.pickupLongitude != null)
            Padding(
              padding: const EdgeInsets.only(top: RamoSpacing.sm),
              child: Text(
                'Embarque: '
                '${ride.pickupLatitude!.toStringAsFixed(5)}, '
                '${ride.pickupLongitude!.toStringAsFixed(5)}',
              ),
            ),
          if (_actionLabel != null) ...[
            const SizedBox(height: RamoSpacing.lg),
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

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: Theme.of(context).colorScheme.onErrorContainer,
        ),
      ),
    );
  }
}
