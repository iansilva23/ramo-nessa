import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../rides/domain/prepared_ride.dart';

class CashChangeDialog extends StatefulWidget {
  const CashChangeDialog({super.key, required this.totalCents});

  final int totalCents;

  @override
  State<CashChangeDialog> createState() => _CashChangeDialogState();
}

class _CashChangeDialogState extends State<CashChangeDialog> {
  bool _needsChange = false;
  int? _tenderedCents;

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
    final tendered = _tenderedCents;
    final validChange = tendered != null && tendered > widget.totalCents;
    return AlertDialog(
      title: const Text('Pagamento em dinheiro'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Total da corrida · ${PreparedRide.formatCents(widget.totalCents)}'),
            const SizedBox(height: RamoSpacing.sm),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Precisa de troco?'),
              value: _needsChange,
              onChanged: (value) => setState(() {
                _needsChange = value;
                _tenderedCents = null;
              }),
            ),
            if (_needsChange) ...[
              TextField(
                key: const Key('cash-change-amount'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]')),
                  LengthLimitingTextInputFormatter(8),
                ],
                decoration: const InputDecoration(
                  labelText: 'Vai pagar com quanto?',
                  prefixText: r'R$ ',
                  hintText: '50,00',
                ),
                onChanged: _updateAmount,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                validChange
                    ? 'Seu troco · ${PreparedRide.formatCents(tendered - widget.totalCents)}'
                    : 'Informe um valor maior que o total da corrida.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Voltar')),
        FilledButton(
          onPressed: _needsChange && !validChange
              ? null
              : () => Navigator.pop(context, _needsChange ? tendered : 0),
          child: const Text('Confirmar dinheiro'),
        ),
      ],
    );
  }
}
