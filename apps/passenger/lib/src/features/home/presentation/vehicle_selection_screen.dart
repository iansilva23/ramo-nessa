import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../domain/service_type.dart';
import 'widgets/service_selector.dart';

class VehicleSelectionResult {
  const VehicleSelectionResult({
    required this.service,
    required this.passengerCount,
  });

  final ServiceType service;
  final int passengerCount;
}

class VehicleSelectionScreen extends StatefulWidget {
  const VehicleSelectionScreen({
    super.key,
    required this.originLabel,
    required this.destinationLabel,
    required this.routeSummary,
    required this.availableServices,
    required this.initialService,
    required this.buggyMinPassengers,
    required this.buggyMaxPassengers,
    required this.onContinue,
  });

  final String originLabel;
  final String destinationLabel;
  final String routeSummary;
  final List<ServiceType> availableServices;
  final ServiceType initialService;
  final int buggyMinPassengers;
  final int buggyMaxPassengers;
  final Future<String?> Function(VehicleSelectionResult result) onContinue;

  @override
  State<VehicleSelectionScreen> createState() =>
      _VehicleSelectionScreenState();
}

class _VehicleSelectionScreenState extends State<VehicleSelectionScreen> {
  late ServiceType _selected = widget.initialService;
  late int _passengerCount =
      _selected == ServiceType.buggy ? widget.buggyMinPassengers : 1;
  bool _submitting = false;
  String? _error;

  void _select(ServiceType service) {
    if (_selected == service || _submitting) return;
    setState(() {
      _selected = service;
      _passengerCount =
          service == ServiceType.buggy ? widget.buggyMinPassengers : 1;
      _error = null;
    });
  }

  void _changePassengers(int value) {
    if (_selected != ServiceType.buggy) return;
    if (
      value < widget.buggyMinPassengers ||
      value > widget.buggyMaxPassengers
    ) {
      return;
    }
    setState(() => _passengerCount = value);
  }

  Future<void> _continue() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    final error = await widget.onContinue(
      VehicleSelectionResult(
        service: _selected,
        passengerCount: _passengerCount,
      ),
    );

    if (!mounted) return;
    setState(() {
      _submitting = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Escolha o veículo'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                children: [
                  Text(
                    'Qual opção combina com essa viagem?',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.8,
                        ),
                  ),
                  const SizedBox(height: RamoSpacing.xs),
                  Text(
                    'Mostramos somente as categorias permitidas para esta rota.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: RamoColors.muted,
                        ),
                  ),
                  const SizedBox(height: RamoSpacing.lg),
                  Container(
                    padding: const EdgeInsets.all(RamoSpacing.md),
                    decoration: BoxDecoration(
                      color: RamoColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(RamoRadius.lg),
                    ),
                    child: Column(
                      children: [
                        _TripLine(
                          icon: Icons.my_location_rounded,
                          text: widget.originLabel,
                        ),
                        const SizedBox(height: RamoSpacing.sm),
                        _TripLine(
                          icon: Icons.location_on_rounded,
                          text: widget.destinationLabel,
                        ),
                        const SizedBox(height: RamoSpacing.sm),
                        Row(
                          children: [
                            const Icon(Icons.route_rounded, size: 18),
                            const SizedBox(width: RamoSpacing.xs),
                            Expanded(
                              child: Text(
                                widget.routeSummary,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: RamoColors.muted,
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: RamoSpacing.xl),
                  ServiceSelector(
                    selected: _selected,
                    services: widget.availableServices,
                    onChanged: _select,
                  ),
                  if (_selected == ServiceType.buggy) ...[
                    const SizedBox(height: RamoSpacing.md),
                    _PassengerCounter(
                      count: _passengerCount,
                      min: widget.buggyMinPassengers,
                      max: widget.buggyMaxPassengers,
                      onChanged: _changePassengers,
                    ),
                  ],
                  const SizedBox(height: RamoSpacing.md),
                  Text(
                    'O preço aparece na próxima etapa, junto com as formas de pagamento.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: RamoColors.muted,
                        ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      _error!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.error,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(
                RamoSpacing.lg,
                RamoSpacing.sm,
                RamoSpacing.lg,
                RamoSpacing.lg,
              ),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                border: Border(
                  top: BorderSide(
                    color: Theme.of(context)
                        .dividerColor
                        .withValues(alpha: .35),
                  ),
                ),
              ),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  key: const Key('continue-vehicle-button'),
                  onPressed: _submitting ? null : _continue,
                  style: FilledButton.styleFrom(
                    backgroundColor: RamoColors.brandBlack,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _submitting
                      ? const SizedBox.square(
                          dimension: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Continuar',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
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

class _TripLine extends StatelessWidget {
  const _TripLine({
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: RamoSpacing.sm),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

class _PassengerCounter extends StatelessWidget {
  const _PassengerCounter({
    required this.count,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final int count;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: RamoSpacing.sm,
        vertical: RamoSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        children: [
          const Icon(Icons.groups_2_rounded, size: 20),
          const SizedBox(width: RamoSpacing.xs),
          Expanded(
            child: Text(
              'Passageiros',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          IconButton(
            tooltip: 'Remover passageiro',
            onPressed: count > min ? () => onChanged(count - 1) : null,
            icon: const Icon(Icons.remove_rounded),
          ),
          SizedBox(
            width: 28,
            child: Text(
              '$count',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
          IconButton(
            tooltip: 'Adicionar passageiro',
            onPressed: count < max ? () => onChanged(count + 1) : null,
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
    );
  }
}
