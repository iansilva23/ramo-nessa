import 'dart:async';
import '../../pricing/domain/pricing_quote.dart';
import '../../pricing/data/pricing_quote_service.dart';
import '../../pricing/data/shared_transfer_option.dart';
import 'widgets/shared_transfer_button.dart';
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
    this.sharedTransfer,
    this.requiresFourByFour = false,
    required this.originLabel,
    required this.destinationLabel,
    required this.routeSummary,
    required this.availableServices,
    required this.initialService,
    required this.buggyMinPassengers,
    required this.buggyMaxPassengers,
    this.onQuote,
    required this.onContinue,
  });

  final SharedTransferOption? sharedTransfer;
  final bool requiresFourByFour;
  final String originLabel;
  final String destinationLabel;
  final String routeSummary;
  final List<ServiceType> availableServices;
  final ServiceType initialService;
  final int buggyMinPassengers;
  final int buggyMaxPassengers;
  final Future<PricingQuote> Function(VehicleSelectionResult result)? onQuote;
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

  final Map<ServiceType, String> _priceLabels = {};
  final Map<ServiceType, PricingQuote> _confirmedQuotes = {};
  final Set<ServiceType> _priceFailures = {};
  final Set<ServiceType> _unavailableServices = {};
  bool get _canContinue => !_submitting && _confirmedQuotes[_selected]?.isExact == true &&
      !_unavailableServices.contains(_selected);
  List<ServiceType> get _visibleServices => widget.availableServices
      .where((service) => !_unavailableServices.contains(service))
      .toList(growable: false);
  Timer? _quoteDebounce;
  int _quoteGeneration = 0;

  @override
  void initState() {
    super.initState();
    _refreshPrices();
  }

  @override
  void dispose() {
    _quoteDebounce?.cancel();
    _quoteGeneration++;
    super.dispose();
  }

  int _passengersFor(ServiceType service) {
    if (service == ServiceType.buggy) {
      return _passengerCount < widget.buggyMinPassengers
          ? widget.buggyMinPassengers
          : _passengerCount;
    }
    if (service == ServiceType.car || service == ServiceType.comfortBlack) {
      return _passengerCount;
    }
    return 1;
  }

  void _refreshPrices({bool debounce = false}) {
    _quoteDebounce?.cancel();
    final generation = ++_quoteGeneration;
    final quote = widget.onQuote;
    _priceFailures.clear();
    _unavailableServices.clear();
    _confirmedQuotes.clear();
    for (final service in widget.availableServices) {
      _priceLabels[service] = quote == null ? 'Falha na cotação' : 'Calculando…';
      if (quote == null) _priceFailures.add(service);
    }
    if (quote == null) return;
    final selections = [
      for (final service in widget.availableServices)
        VehicleSelectionResult(
          service: service,
          passengerCount: _passengersFor(service),
        ),
    ];
    void load() {
      for (final selection in selections) {
        unawaited(_loadPrice(selection, generation, quote));
      }
    }
    if (debounce) {
      _quoteDebounce = Timer(const Duration(milliseconds: 250), load);
    } else {
      load();
    }
  }

  Future<void> _loadPrice(
    VehicleSelectionResult selection,
    int generation,
    Future<PricingQuote> Function(VehicleSelectionResult) quote,
  ) async {
    try {
      final result = await quote(selection);
      if (!mounted || generation != _quoteGeneration) return;
      setState(() {
        _confirmedQuotes[selection.service] = result;
        _priceLabels[selection.service] = result.formatted;
      });
    } catch (error) {
      if (!mounted || generation != _quoteGeneration) return;
      setState(() {
        final code = error is PricingQuoteException ? error.code : null;
        if (code == 'UNAVAILABLE_CATEGORY' || code == 'UNKNOWN_ROUTE') {
          // Business rejection is authoritative, not a temporary offline error.
          _unavailableServices.add(selection.service);
          if (_selected == selection.service) {
            final candidates = widget.availableServices
                .where((service) => !_unavailableServices.contains(service));
            if (candidates.isNotEmpty) {
              _selected = candidates.first;
              _passengerCount = _selected == ServiceType.buggy
                  ? widget.buggyMinPassengers : 1;
            }
          }
        } else {
          _priceLabels[selection.service] = code == 'UNKNOWN_LOCALITY'
              ? 'Local não reconhecido' : 'Falha na cotação';
          _priceFailures.add(selection.service);
        }
      });
    }
  }

  void _select(ServiceType service) {
    if (_selected == service || _submitting || _unavailableServices.contains(service)) return;
    setState(() {
      _selected = service;
      _passengerCount =
          service == ServiceType.buggy ? widget.buggyMinPassengers : 1;
      _error = null;
      _refreshPrices();
    });
  }

  bool get _hasPassengerCounter => [ServiceType.buggy, ServiceType.car, ServiceType.comfortBlack].contains(_selected);

  void _changePassengers(int value) {
    if (!_hasPassengerCounter || _submitting) return;
    if (
      value < widget.buggyMinPassengers ||
      value > widget.buggyMaxPassengers
    ) {
      return;
    }
    setState(() {
      _passengerCount = value;
      _refreshPrices(debounce: true);
    });
  }

  Future<void> _continue() async {
    if (!_canContinue) {
      if (!mounted) return;
      setState(() => _error = 'Aguarde uma tarifa confirmada antes de continuar.');
      return;
    }
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
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: RamoSpacing.lg),
                  Container(
                    padding: const EdgeInsets.all(RamoSpacing.md),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
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
                                      color: Theme.of(context).colorScheme.onSurfaceVariant,
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
                  if (widget.requiresFourByFour) const Padding(padding: EdgeInsets.only(bottom: 12), child: Text('Carro e Comfort/Black nesta rota exigem veículo 4x4 aprovado.')),
                  if (_submitting) const Column(children: [Center(child:RamoSearchPulse()), Text('Procurando motorista próximo…'), SizedBox(height:16)]),
                  if (_visibleServices.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        'Não há categorias com tarifa aprovada para esta rota. '
                        'Atualize os preços ou escolha outro trajeto.',
                        key: Key('no-priced-vehicle-message'),
                      ),
                    )
                  else
                    ServiceSelector(
                      selected: _selected,
                      services: _visibleServices,
                      onChanged: _select,
                      priceLabels: _priceLabels,
                    ),
                  if (_unavailableServices.isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Categorias sem tarifa para esta rota foram ocultadas.',
                        key: Key('hidden-unpriced-categories'),
                      ),
                    ),
                  if (_priceFailures.isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Não foi possível confirmar alguns preços. '
                        'Confira a localidade ou tente atualizar.',
                        key: Key('pricing-quote-error-message'),
                      ),
                    ),
                  if (_hasPassengerCounter) ...[
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
                    'Valores do trajeto. Descontos, adicionais e total da forma de pagamento serão confirmados na próxima etapa.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  if (_priceFailures.isNotEmpty || _unavailableServices.isNotEmpty)
                    TextButton.icon(
                      onPressed: _submitting
                          ? null
                          : () => setState(() => _refreshPrices()),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Atualizar preços'),
                    ),
                  if (widget.sharedTransfer != null) SharedTransferButton(option: widget.sharedTransfer!, enabled: !_submitting),
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
                  onPressed: _canContinue ? _continue : null,
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
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
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

