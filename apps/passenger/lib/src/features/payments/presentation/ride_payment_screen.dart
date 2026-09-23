import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../rides/domain/prepared_ride.dart';
import '../data/passenger_payment_service.dart';

class RidePaymentScreen extends StatefulWidget {
  const RidePaymentScreen({
    super.key,
    required this.ride,
    this.paymentService,
  });

  final PreparedRide ride;
  final PassengerPaymentService? paymentService;

  @override
  State<RidePaymentScreen> createState() => _RidePaymentScreenState();
}

class _RidePaymentScreenState extends State<RidePaymentScreen> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  int? _walletBalanceCents;
  bool _walletLoading = false;
  bool _payingWallet = false;
  String? _walletMessage;
  late final String _walletIdempotencyKey;

  @override
  void initState() {
    super.initState();
    _walletIdempotencyKey =
        'wallet-${widget.ride.id}-${DateTime.now().microsecondsSinceEpoch}';
    _updateRemaining();
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateRemaining(),
    );
    _loadWallet();
  }

  Future<void> _loadWallet() async {
    final service = widget.paymentService;
    if (service == null) return;

    setState(() {
      _walletLoading = true;
      _walletMessage = null;
    });

    try {
      final balance = await service.walletBalanceCents();
      if (!mounted) return;
      setState(() {
        _walletBalanceCents = balance;
        _walletLoading = false;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _walletLoading = false;
        _walletMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _walletLoading = false;
        _walletMessage = 'Não conseguimos consultar a carteira agora.';
      });
    }
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

  bool get _walletHasEnough =>
      _walletBalanceCents != null &&
      _walletBalanceCents! >= widget.ride.totalAmountCents;

  Future<void> _payWallet() async {
    final service = widget.paymentService;
    if (service == null || !_walletHasEnough || _payingWallet) return;

    setState(() {
      _payingWallet = true;
      _walletMessage = null;
    });

    try {
      final result = await service.payRideWithWallet(
        rideId: widget.ride.id,
        idempotencyKey: _walletIdempotencyKey,
      );

      if (!mounted) return;
      if (!result.paymentConfirmed) {
        setState(() {
          _payingWallet = false;
          _walletBalanceCents = result.walletBalanceCents;
          _walletMessage =
              'O Core ainda não confirmou o pagamento da corrida.';
        });
        return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => _PaymentConfirmedScreen(
            remainingWalletCents: result.walletBalanceCents,
            dispatchStatus: result.dispatchStatus,
          ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _payingWallet = false;
        _walletMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _payingWallet = false;
        _walletMessage = 'Não conseguimos concluir o pagamento agora.';
      });
    }
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
    final walletSubtitle = switch ((
      widget.paymentService,
      _walletLoading,
      _walletBalanceCents,
    )) {
      (null, _, _) =>
        'Será habilitada com a autenticação do passageiro',
      (_, true, _) => 'Consultando saldo…',
      (_, false, final int balance) =>
        'Saldo: ${PreparedRide.formatCents(balance)}',
      _ => _walletMessage ?? 'Saldo indisponível agora',
    };

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
              subtitle:
                  'Pagamento confirmado antes do motorista receber a corrida',
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
              subtitle: walletSubtitle,
              enabled:
                  !expired && !_walletLoading && _walletHasEnough && !_payingWallet,
              trailing: _payingWallet
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : null,
              onTap: _payWallet,
            ),
            if (_walletBalanceCents != null &&
                !_walletHasEnough &&
                !_walletLoading) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                'Saldo insuficiente para esta corrida.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (_walletMessage != null) ...[
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _walletMessage!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.error,
                    ),
              ),
            ],
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

class _PaymentConfirmedScreen extends StatelessWidget {
  const _PaymentConfirmedScreen({
    required this.remainingWalletCents,
    this.dispatchStatus,
  });

  final int remainingWalletCents;
  final String? dispatchStatus;

  String get _dispatchMessage => switch (dispatchStatus) {
        'SEARCHING_DRIVER' =>
          'Pagamento confirmado. A corrida já foi enviada ao motorista.',
        'NO_DRIVER_FOUND' =>
          'Pagamento confirmado. Não encontramos motorista nesta rodada.',
        'PENDING_RETRY' =>
          'Pagamento confirmado. O Core vai repetir a tentativa de despacho.',
        _ => 'Pagamento confirmado e corrida liberada para o matching.',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.check_circle_rounded,
                size: 82,
                color: RamoColors.signal,
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                'Pagamento confirmado',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _dispatchMessage,
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                'Saldo restante: '
                '${PreparedRide.formatCents(remainingWalletCents)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: RamoSpacing.xl),
              FilledButton(
                onPressed: () =>
                    Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Voltar ao início'),
              ),
            ],
          ),
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
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final VoidCallback onTap;
  final Widget? trailing;

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
        trailing: trailing ?? const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
