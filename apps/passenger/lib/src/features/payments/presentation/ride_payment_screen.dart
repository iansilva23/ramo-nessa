import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../rides/domain/prepared_ride.dart';

class RidePaymentScreen extends StatefulWidget {
  const RidePaymentScreen({
    super.key,
    required this.ride,
  });

  final PreparedRide ride;

  @override
  State<RidePaymentScreen> createState() => _RidePaymentScreenState();
}

class _RidePaymentScreenState extends State<RidePaymentScreen> {
  Timer? _timer;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateRemaining(),
    );
  }

  void _updateRemaining() {
    final remaining = widget.ride.holdExpiresAt.difference(DateTime.now());
    if (!mounted) return;

    setState(() {
      _remaining = remaining.isNegative ? Duration.zero : remaining;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _countdown {
    final seconds = _remaining.inSeconds;
    final minutes = seconds ~/ 60;
    final rest = (seconds % 60).toString().padLeft(2, '0');
    return '$minutes:$rest';
  }

  void _gatewayPending(String method) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            '$method será ativado quando o gateway real estiver conectado. '
            'Nenhuma cobrança foi feita.',
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final expired = _remaining == Duration.zero;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pagamento'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(RamoSpacing.lg),
          children: [
            Text(
              'Preço final',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text(
              widget.ride.formattedTotal,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: RamoSpacing.md),
            _PriceRow(
              label: 'Corrida',
              cents: widget.ride.baseAmountCents,
            ),
            if (widget.ride.pickupCompensationCents > 0)
              _PriceRow(
                label: 'Coleta distante · 100% motorista',
                cents: widget.ride.pickupCompensationCents,
              ),
            const Divider(height: RamoSpacing.xl),
            Container(
              padding: const EdgeInsets.all(RamoSpacing.md),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(RamoRadius.md),
              ),
              child: Row(
                children: [
                  const Icon(Icons.lock_clock_rounded),
                  const SizedBox(width: RamoSpacing.sm),
                  Expanded(
                    child: Text(
                      expired
                          ? 'A reserva expirou. Volte e atualize a corrida.'
                          : 'Preço e motorista reservados por $_countdown.',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: RamoSpacing.xl),
            Text(
              'Como quer pagar?',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              icon: Icons.pix_rounded,
              title: 'Pix',
              subtitle: 'Pagamento confirmado antes do motorista receber a corrida',
              enabled: !expired,
              onTap: () => _gatewayPending('Pix'),
            ),
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              icon: Icons.credit_card_rounded,
              title: 'Cartão',
              subtitle: 'Cobrança segura pelo gateway',
              enabled: !expired,
              onTap: () => _gatewayPending('Cartão'),
            ),
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              icon: Icons.account_balance_wallet_rounded,
              title: 'Carteira Ramo Nessa',
              subtitle: 'Usar saldo disponível no app',
              enabled: !expired,
              onTap: () => _gatewayPending('Carteira'),
            ),
            const SizedBox(height: RamoSpacing.lg),
            Text(
              'Dinheiro não está disponível no lançamento.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.cents,
  });

  final String label;
  final int cents;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: RamoSpacing.xs),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            PreparedRide.formatCents(cents),
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _PaymentOption extends StatelessWidget {
  const _PaymentOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        enabled: enabled,
        onTap: enabled ? onTap : null,
        leading: Icon(icon),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
