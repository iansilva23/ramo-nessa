import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

class DriverRideSummaryScreen extends StatefulWidget {
  const DriverRideSummaryScreen({
    super.key,
    required this.api,
  });

  final DriverApi api;

  @override
  State<DriverRideSummaryScreen> createState() =>
      _DriverRideSummaryScreenState();
}

class _DriverRideSummaryScreenState
    extends State<DriverRideSummaryScreen> {
  DriverActivitySnapshot? _activity;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final activity = await widget.api.activity();
      if (!mounted) return;
      setState(() {
        _activity = activity;
        _loading = false;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar seu resumo agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final activity = _activity;

    return Scaffold(
      appBar: AppBar(title: const Text('Resumo de corridas')),
      body: RefreshIndicator(
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
            if (_loading && activity == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && activity == null) ...[
              const SizedBox(height: 48),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: RamoColors.muted),
              ),
              const SizedBox(height: RamoSpacing.md),
              FilledButton(
                onPressed: _load,
                child: const Text('Tentar novamente'),
              ),
            ] else if (activity != null) ...[
              Wrap(
                spacing: RamoSpacing.sm,
                runSpacing: RamoSpacing.sm,
                children: [
                  _MetricCard(
                    label: 'Total',
                    value: activity.total.toString(),
                  ),
                  _MetricCard(
                    label: 'Concluídas',
                    value: activity.completed.toString(),
                  ),
                  _MetricCard(
                    label: 'Canceladas',
                    value: activity.cancelled.toString(),
                  ),
                  _MetricCard(
                    label: 'Ganhos',
                    value: formatCents(activity.earningsCents),
                  ),
                ],
              ),
              const SizedBox(height: RamoSpacing.xl),
              const Text(
                'Corridas recentes',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              if (activity.rides.isEmpty)
                Container(
                  padding: const EdgeInsets.all(RamoSpacing.xl),
                  decoration: BoxDecoration(
                    color: RamoColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(RamoRadius.md),
                  ),
                  child: const Text(
                    'Nenhuma corrida no histórico ainda.',
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ...activity.rides.map(
                  (ride) => Padding(
                    padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
                    child: Container(
                      padding: const EdgeInsets.all(RamoSpacing.md),
                      decoration: BoxDecoration(
                        color: RamoColors.surfaceRaised,
                        borderRadius:
                            BorderRadius.circular(RamoRadius.md),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: Colors.white,
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
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${ride.origin.displayName} → '
                                      '${ride.destination.displayName}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${ride.categoryLabel} · '
                                      '${ride.stateLabel}',
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
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
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
              label,
              style: const TextStyle(
                color: RamoColors.muted,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 20,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
