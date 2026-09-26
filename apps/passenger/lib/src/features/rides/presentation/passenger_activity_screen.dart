import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/passenger_activity_service.dart';
import '../domain/passenger_activity.dart';

class PassengerActivityScreen extends StatefulWidget {
  const PassengerActivityScreen({
    super.key,
    required this.service,
  });

  final PassengerActivityService? service;

  @override
  State<PassengerActivityScreen> createState() =>
      _PassengerActivityScreenState();
}

class _PassengerActivityScreenState
    extends State<PassengerActivityScreen> {
  PassengerActivitySnapshot? _activity;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    final service = widget.service;
    if (service == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Histórico indisponível neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final activity = await service.fetch();
      if (!mounted) return;
      setState(() {
        _activity = activity;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final activity = _activity;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
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
            Text(
              'Suas corridas e viagens recentes.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: RamoColors.muted,
                  ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (_loading && activity == null)
              const Padding(
                padding: EdgeInsets.only(top: 56),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && activity == null)
              _ActivityMessage(
                icon: Icons.cloud_off_rounded,
                title: 'Não foi possível carregar',
                subtitle: _error!,
              )
            else if (activity != null) ...[
              _ActivitySummary(activity: activity),
              const SizedBox(height: RamoSpacing.xl),
              Text(
                'Corridas recentes',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              if (activity.rides.isEmpty)
                const _ActivityMessage(
                  icon: Icons.route_rounded,
                  title: 'Nenhuma corrida ainda',
                  subtitle:
                      'Quando você fizer uma viagem, ela aparecerá aqui.',
                )
              else
                ...activity.rides.map(
                  (ride) => Padding(
                    padding:
                        const EdgeInsets.only(bottom: RamoSpacing.sm),
                    child: _RideActivityCard(ride: ride),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActivitySummary extends StatelessWidget {
  const _ActivitySummary({required this.activity});

  final PassengerActivitySnapshot activity;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Total', activity.total.toString()),
      ('Concluídas', activity.completed.toString()),
      ('Canceladas', activity.cancelled.toString()),
      ('Ativas', activity.active.toString()),
    ];

    final width = (MediaQuery.sizeOf(context).width -
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

class _RideActivityCard extends StatelessWidget {
  const _RideActivityCard({required this.ride});

  final PassengerActivityRide ride;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RamoColors.surfaceRaised,
      borderRadius: BorderRadius.circular(RamoRadius.md),
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: Theme.of(context).colorScheme.surface,
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
                    '${ride.origin} → ${ride.destination}',
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
              _formatCents(ride.totalAmountCents),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityMessage extends StatelessWidget {
  const _ActivityMessage({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 38),
      child: Column(
        children: [
          Icon(icon, size: 44, color: RamoColors.muted),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 5),
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


String _formatCents(int cents) {
  final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
  return 'R\$ $value';
}
