import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../rides/domain/prepared_ride.dart';

class CashChangeSheet extends StatefulWidget {
  const CashChangeSheet({super.key, required this.totalCents, required this.searches});

  final int totalCents;
  final bool searches;

  @override
  State<CashChangeSheet> createState() => _CashChangeSheetState();
}

class _CashChangeSheetState extends State<CashChangeSheet> {
  final _amount = TextEditingController();
  int? _tenderedCents;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _updateAmount(String value) {
    final match = RegExp(r'^(\d{1,5})(?:[,.](\d{0,2}))?$').firstMatch(value.trim());
    setState(() {
      _tenderedCents = match == null
          ? null
          : int.parse(match.group(1)!) * 100 +
                int.parse((match.group(2) ?? '').padRight(2, '0'));
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tendered = _tenderedCents;
    final exact = tendered == 0 && _amount.text.isEmpty;
    final validChange = tendered != null && tendered > widget.totalCents;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const DecoratedBox(
                    decoration: BoxDecoration(color: RamoColors.signal, shape: BoxShape.circle),
                    child: Padding(
                      padding: EdgeInsets.all(11),
                      child: Icon(Icons.payments_outlined, color: RamoColors.ink),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('Pagamento em dinheiro',
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                  IconButton(
                    tooltip: 'Voltar',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: colors.inverseSurface,
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total da corrida', style: theme.textTheme.labelLarge?.copyWith(color: colors.onInverseSurface)),
                    Text(PreparedRide.formatCents(widget.totalCents), style: theme.textTheme.headlineMedium?.copyWith(
                      color: colors.onInverseSurface,
                      fontWeight: FontWeight.w900,
                    )),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              Text('Precisa de troco?', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              TextField(
                key: const Key('cash-change-amount'),
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]')),
                  LengthLimitingTextInputFormatter(8),
                ],
                decoration: InputDecoration(
                  labelText: 'Troco para quanto?',
                  prefixText: r'R$ ',
                  hintText: '50,00',
                  errorText: tendered != null && !exact && !validChange
                      ? 'Informe um valor maior que o total.'
                      : null,
                ),
                onChanged: _updateAmount,
              ),
              const SizedBox(height: 10),
              if (validChange)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Semantics(
                    liveRegion: true,
                    child: Text('Seu troco · ${PreparedRide.formatCents(tendered! - widget.totalCents)}',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                ),
              Semantics(
                selected: exact,
                child: OutlinedButton.icon(
                  icon: Icon(exact ? Icons.check_circle_rounded : Icons.circle_outlined),
                  onPressed: () {
                    _amount.clear();
                    FocusScope.of(context).unfocus();
                    setState(() => _tenderedCents = 0);
                  },
                  label: const Text('Não preciso de troco'),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: RamoColors.signal,
                  foregroundColor: RamoColors.ink,
                ),
                onPressed: exact || validChange ? () => Navigator.pop(context, tendered) : null,
                child: Text(widget.searches ? 'Confirmar e buscar motorista' : 'Confirmar pagamento'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
