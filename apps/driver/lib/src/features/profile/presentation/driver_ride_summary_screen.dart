import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

enum _ActivityPeriod {
  sevenDays,
  fifteenDays,
  thirtyDays,
  threeMonths,
  custom,
}

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
  _ActivityPeriod _period = _ActivityPeriod.sevenDays;
  DateTimeRange? _customRange;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime _startOfDay(DateTime value) =>
      DateTime(value.year, value.month, value.day);

  DateTime _endExclusive(DateTime value) =>
      DateTime(value.year, value.month, value.day + 1);

  ({DateTime from, DateTime to}) _selectedRange() {
    final now = DateTime.now();
    final todayEnd = _endExclusive(now);

    switch (_period) {
      case _ActivityPeriod.sevenDays:
        return (
          from: _startOfDay(now.subtract(const Duration(days: 6))),
          to: todayEnd,
        );
      case _ActivityPeriod.fifteenDays:
        return (
          from: _startOfDay(now.subtract(const Duration(days: 14))),
          to: todayEnd,
        );
      case _ActivityPeriod.thirtyDays:
        return (
          from: _startOfDay(now.subtract(const Duration(days: 29))),
          to: todayEnd,
        );
      case _ActivityPeriod.threeMonths:
        return (
          from: _startOfDay(now.subtract(const Duration(days: 89))),
          to: todayEnd,
        );
      case _ActivityPeriod.custom:
        final range = _customRange;
        if (range == null) {
          return (
            from: _startOfDay(now.subtract(const Duration(days: 6))),
            to: todayEnd,
          );
        }
        return (
          from: _startOfDay(range.start),
          to: _endExclusive(range.end),
        );
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final range = _selectedRange();
      final activity = await widget.api.activity(
        from: range.from,
        to: range.to,
      );
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
        _error = 'Não conseguimos carregar sua atividade agora.';
      });
    }
  }

  Future<void> _selectPeriod(_ActivityPeriod period) async {
    if (period == _ActivityPeriod.custom) {
      final now = DateTime.now();
      final current = _customRange ??
          DateTimeRange(
            start: now.subtract(const Duration(days: 6)),
            end: now,
          );
      final selected = await showDateRangePicker(
        context: context,
        firstDate: DateTime(now.year - 2),
        lastDate: now,
        initialDateRange: current,
        helpText: 'Escolha o período',
        cancelText: 'Cancelar',
        confirmText: 'Aplicar',
        saveText: 'Aplicar',
      );
      if (selected == null || !mounted) return;
      setState(() {
        _period = period;
        _customRange = selected;
      });
      await _load();
      return;
    }

    if (_period == period) return;
    setState(() => _period = period);
    await _load();
  }

  String _periodLabel(_ActivityPeriod period) => switch (period) {
        _ActivityPeriod.sevenDays => '7 dias',
        _ActivityPeriod.fifteenDays => '15 dias',
        _ActivityPeriod.thirtyDays => '30 dias',
        _ActivityPeriod.threeMonths => '3 meses',
        _ActivityPeriod.custom => 'Personalizado',
      };

  String _dateLabel(DateTime value) {
    final local = value.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    return '$day/$month/${local.year}';
  }

  String _paymentLabel(String? method) => switch (method) {
        'pix' => 'Pix',
        'card' => 'Cartão',
        'wallet' => 'Carteira',
        'cash' => 'Dinheiro',
        _ => 'Não informado',
      };

  void _showRideDetails(DriverActivityRide ride) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.sm,
            RamoSpacing.lg,
            RamoSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ride.stateLabel,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                ),
              ),
              const SizedBox(height: RamoSpacing.md),
              _DetailRow(label: 'Embarque', value: ride.origin.displayName),
              _DetailRow(
                label: 'Destino',
                value: ride.destination.displayName,
              ),
              _DetailRow(label: 'Categoria', value: ride.categoryLabel),
              _DetailRow(
                label: 'Pagamento',
                value: _paymentLabel(ride.paymentMethod),
              ),
              _DetailRow(label: 'Data', value: _dateLabel(ride.updatedAt)),
              const Divider(height: RamoSpacing.xl),
              _DetailRow(
                label: 'Valor da corrida',
                value: formatCents(ride.totalAmountCents),
              ),
              _DetailRow(
                label: 'Taxa Ramo Nessa',
                value: formatCents(ride.platformFeeCents),
              ),
              _DetailRow(
                label: 'Seu ganho',
                value: formatCents(ride.driverEarningsCents),
                emphasized: true,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activity = _activity;

    return Scaffold(
      appBar: AppBar(title: const Text('Atividade')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.md,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            const Text(
              'Período',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _ActivityPeriod.values
                    .map(
                      (period) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          selected: _period == period,
                          label: Text(_periodLabel(period)),
                          onSelected: (_) => _selectPeriod(period),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
            if (_period == _ActivityPeriod.custom &&
                _customRange != null) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                '${_dateLabel(_customRange!.start)} a '
                '${_dateLabel(_customRange!.end)}',
                style: const TextStyle(
                  color: RamoColors.muted,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ],
            const SizedBox(height: RamoSpacing.lg),
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
              if (_loading)
                const LinearProgressIndicator(minHeight: 2),
              Wrap(
                spacing: RamoSpacing.sm,
                runSpacing: RamoSpacing.sm,
                children: [
                  _MetricCard(
                    label: 'Corridas',
                    value: activity.total.toString(),
                  ),
                  _MetricCard(
                    label: 'Concluídas',
                    value: activity.completed.toString(),
                  ),
                  _MetricCard(
                    label: 'Seus ganhos',
                    value: formatCents(activity.earningsCents),
                  ),
                  _MetricCard(
                    label: 'Média / corrida',
                    value: formatCents(activity.averageEarningsCents),
                  ),
                  _MetricCard(
                    label: 'Valor bruto',
                    value: formatCents(activity.grossCents),
                  ),
                  _MetricCard(
                    label: 'Taxa do app',
                    value: formatCents(activity.platformFeeCents),
                  ),
                  _MetricCard(
                    label: 'Saques pagos',
                    value: formatCents(activity.payoutsPaidCents),
                  ),
                  _MetricCard(
                    label: 'Saldo disponível',
                    value: formatCents(activity.availableBalanceCents),
                  ),
                ],
              ),
              if (activity.payoutsRequestedCents >
                  activity.payoutsPaidCents) ...[
                const SizedBox(height: RamoSpacing.sm),
                Container(
                  padding: const EdgeInsets.all(RamoSpacing.md),
                  decoration: BoxDecoration(
                    color: RamoColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(RamoRadius.md),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule_rounded),
                      const SizedBox(width: RamoSpacing.sm),
                      Expanded(
                        child: Text(
                          'Saques solicitados no período: '
                          '${formatCents(activity.payoutsRequestedCents)}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: RamoSpacing.xl),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Corridas no período',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  Text(
                    '${activity.cancelled} cancelada(s)',
                    style: const TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
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
                    'Nenhuma corrida encontrada nesse período.',
                    textAlign: TextAlign.center,
                  ),
                )
              else
                ...activity.rides.map(
                  (ride) => Padding(
                    padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
                    child: Material(
                      color: RamoColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(RamoRadius.md),
                      child: InkWell(
                        onTap: () => _showRideDetails(ride),
                        borderRadius:
                            BorderRadius.circular(RamoRadius.md),
                        child: Padding(
                          padding: const EdgeInsets.all(RamoSpacing.md),
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
                                      '${ride.stateLabel} · '
                                      '${_dateLabel(ride.updatedAt)}',
                                      style: const TextStyle(
                                        color: RamoColors.muted,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: RamoSpacing.sm),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    formatCents(
                                      ride.driverEarningsCents,
                                    ),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  const Icon(
                                    Icons.chevron_right_rounded,
                                    size: 18,
                                    color: RamoColors.muted,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
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
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 115,
            child: Text(
              label,
              style: const TextStyle(
                color: RamoColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight:
                    emphasized ? FontWeight.w900 : FontWeight.w700,
                fontSize: emphasized ? 17 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
