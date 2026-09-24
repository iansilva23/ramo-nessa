import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../rides/data/passenger_ride_realtime_service.dart';
import '../../rides/data/passenger_ride_tracking_service.dart';
import '../../rides/domain/prepared_ride.dart';
import '../../rides/presentation/ride_tracking_screen.dart';
import '../data/card_tokenization_service.dart';
import '../data/passenger_payment_service.dart';
import '../domain/card_ride_payment_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/pix_ride_payment_result.dart';

class RidePaymentScreen extends StatefulWidget {
  const RidePaymentScreen({
    super.key,
    required this.ride,
    this.paymentService,
    this.cardTokenizationService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.networkTilesEnabled = true,
  });

  final PreparedRide ride;
  final PassengerPaymentService? paymentService;
  final CardTokenizationService? cardTokenizationService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final bool networkTilesEnabled;

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
  bool _creatingPix = false;
  String? _pixMessage;
  bool _creatingCard = false;
  String? _cardMessage;
  PassengerPaymentPolicy? _paymentPolicy;
  bool _paymentPolicyLoading = false;
  bool _authorizingCash = false;
  String? _cashMessage;
  late final String _walletIdempotencyKey;
  late final String _cashIdempotencyKey;
  late final String _pixIdempotencyKey;
  late final String _cardIdempotencyKey;

  @override
  void initState() {
    super.initState();
    final nonce = DateTime.now().microsecondsSinceEpoch;
    _walletIdempotencyKey =
        'wallet-${widget.ride.id}-$nonce';
    _cashIdempotencyKey =
        'cash-${widget.ride.id}-$nonce';
    _pixIdempotencyKey =
        'pix-${widget.ride.id}-$nonce';
    _cardIdempotencyKey =
        'card-${widget.ride.id}-$nonce';
    _updateRemaining();
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateRemaining(),
    );
    _loadWallet();
    _loadPaymentPolicy();
  }

  Future<void> _loadPaymentPolicy() async {
    final service = widget.paymentService;
    if (service == null) return;

    setState(() {
      _paymentPolicyLoading = true;
      _cashMessage = null;
    });

    try {
      final policy = await service.paymentPolicy();
      if (!mounted) return;
      setState(() {
        _paymentPolicy = policy;
        _paymentPolicyLoading = false;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _paymentPolicyLoading = false;
        _cashMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _paymentPolicyLoading = false;
        _cashMessage =
            'Não conseguimos consultar o pagamento em dinheiro agora.';
      });
    }
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

  bool get _cashAvailable =>
      _paymentPolicy?.cashAvailable == true;

  Future<String?> _requestPayerEmail(String paymentName) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _PayerEmailSheet(paymentName: paymentName),
    );
  }

  Future<void> _startPix() async {
    final service = widget.paymentService;
    if (service == null || _creatingPix || _remaining == Duration.zero) return;

    final payerEmail = await _requestPayerEmail('Pix');
    if (!mounted || payerEmail == null) return;

    setState(() {
      _creatingPix = true;
      _pixMessage = null;
    });

    try {
      final result = await service.createPixRidePayment(
        rideId: widget.ride.id,
        idempotencyKey: _pixIdempotencyKey,
        payerEmail: payerEmail,
      );

      if (!mounted) return;
      setState(() => _creatingPix = false);

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => _PixPaymentScreen(
            rideId: widget.ride.id,
            holdExpiresAt: widget.ride.holdExpiresAt,
            result: result,
            trackingService: widget.rideTrackingService,
            realtimeService: widget.rideRealtimeService,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingPix = false;
        _pixMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatingPix = false;
        _pixMessage = 'Não conseguimos gerar o Pix agora.';
      });
    }
  }

  Future<void> _startCard() async {
    final service = widget.paymentService;
    if (service == null || _creatingCard || _remaining == Duration.zero) return;

    final payerEmail = await _requestPayerEmail('cartão');
    if (!mounted || payerEmail == null) return;

    setState(() {
      _creatingCard = true;
      _cardMessage = null;
    });

    try {
      final tokenizer =
          widget.cardTokenizationService ??
          const NativeCardTokenizationService();
      final tokenized = await tokenizer.tokenize();
      if (!mounted) return;

      final result = await service.createCardRidePayment(
        rideId: widget.ride.id,
        idempotencyKey: _cardIdempotencyKey,
        payerEmail: payerEmail,
        cardToken: tokenized.token,
        paymentMethodId: tokenized.paymentMethodId,
        paymentMethodType: tokenized.paymentMethodType,
      );

      if (!mounted) return;
      setState(() => _creatingCard = false);

      final failed =
          result.internalPaymentStatus == 'failed' ||
          result.internalPaymentStatus == 'cancelled' ||
          result.rideState == 'PAYMENT_FAILED';
      if (failed) {
        setState(() {
          _cardMessage =
              'Pagamento não aprovado. Confira os dados ou tente outro cartão.';
        });
        return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => _CardPaymentStatusScreen(
            rideId: widget.ride.id,
            result: result,
            trackingService: widget.rideTrackingService,
            realtimeService: widget.rideRealtimeService,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on CardTokenizationException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage = error.message;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage =
            'Não conseguimos concluir o pagamento por cartão agora.';
      });
    }
  }

  Future<void> _authorizeCash() async {
    final service = widget.paymentService;
    if (service == null || !_cashAvailable || _authorizingCash) {
      return;
    }

    setState(() {
      _authorizingCash = true;
      _cashMessage = null;
    });

    try {
      final result = await service.authorizeCashRide(
        rideId: widget.ride.id,
        idempotencyKey: _cashIdempotencyKey,
      );

      if (!mounted) return;
      if (!result.authorized) {
        setState(() {
          _authorizingCash = false;
          _cashMessage =
              'O Core ainda não autorizou o pagamento em dinheiro.';
        });
        return;
      }

      if (result.dispatchStatus == 'NO_DRIVER_FOUND') {
        setState(() {
          _authorizingCash = false;
          _cashMessage =
              'Não encontramos motorista disponível agora. '
              'Nenhum valor foi cobrado.';
        });
        return;
      }

      final tracking = widget.rideTrackingService;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => tracking == null
              ? _CashAuthorizedScreen(
                  amountCents: result.amountCents,
                  dispatchStatus: result.dispatchStatus,
                )
              : RideTrackingScreen(
                  rideId: widget.ride.id,
                  remainingWalletCents: null,
                  paymentMethod: 'cash',
                  trackingService: tracking,
                  realtimeService: widget.rideRealtimeService,
                  initialDispatchStatus: result.dispatchStatus,
                  networkTilesEnabled: widget.networkTilesEnabled,
                ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _authorizingCash = false;
        _cashMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _authorizingCash = false;
        _cashMessage =
            'Não conseguimos autorizar o pagamento em dinheiro agora.';
      });
    }
  }

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
      if (result.paymentRefunded) {
        setState(() {
          _payingWallet = false;
          _walletBalanceCents = result.walletBalanceCents;
          _walletMessage = result.dispatchStatus == 'NO_DRIVER_FOUND'
              ? 'Não encontramos motorista disponível. '
                  'O valor voltou integralmente para sua Carteira Ramo Nessa.'
              : 'A corrida não pôde ser liberada e o valor voltou '
                  'integralmente para sua Carteira Ramo Nessa.';
        });
        return;
      }

      if (!result.paymentConfirmed) {
        setState(() {
          _payingWallet = false;
          _walletBalanceCents = result.walletBalanceCents;
          _walletMessage =
              'O Core ainda não confirmou o pagamento da corrida.';
        });
        return;
      }

      final tracking = widget.rideTrackingService;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => tracking == null
              ? _PaymentConfirmedScreen(
                  remainingWalletCents: result.walletBalanceCents,
                  dispatchStatus: result.dispatchStatus,
                )
              : RideTrackingScreen(
                  rideId: widget.ride.id,
                  remainingWalletCents: result.walletBalanceCents,
                  paymentMethod: 'wallet',
                  trackingService: tracking,
                  realtimeService: widget.rideRealtimeService,
                  initialDispatchStatus: result.dispatchStatus,
                  networkTilesEnabled: widget.networkTilesEnabled,
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

  @override
  Widget build(BuildContext context) {
    final expired = _remaining == Duration.zero;
    final cashSubtitle = _paymentPolicyLoading
        ? 'Verificando disponibilidade…'
        : _cashAvailable
            ? 'Pague diretamente ao motorista no fim da corrida'
            : 'Em breve · será liberado pelo Ramo Nessa';

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
              key: const Key('payment-option-pix'),
              icon: Icons.pix_rounded,
              title: 'Pix',
              subtitle:
                  'Pagamento confirmado antes do motorista receber a corrida',
              enabled:
                  !expired &&
                  widget.paymentService != null &&
                  !_creatingPix,
              trailing: _creatingPix
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : null,
              onTap: _startPix,
            ),
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              key: const Key('payment-option-card'),
              icon: Icons.credit_card_rounded,
              title: 'Cartão',
              subtitle: 'Dados protegidos pelo Mercado Pago · 3DS quando necessário',
              enabled:
                  !expired &&
                  widget.paymentService != null &&
                  !_creatingCard,
              trailing: _creatingCard
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : null,
              onTap: _startCard,
            ),
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              key: const Key('payment-option-wallet'),
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
            const SizedBox(height: RamoSpacing.sm),
            _PaymentOption(
              key: const Key('payment-option-cash'),
              icon: Icons.payments_rounded,
              title: 'Dinheiro',
              subtitle: cashSubtitle,
              enabled:
                  !expired &&
                  !_paymentPolicyLoading &&
                  _cashAvailable &&
                  !_authorizingCash,
              trailing: _authorizingCash
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : !_cashAvailable
                      ? const Chip(
                          label: Text('Em breve'),
                          visualDensity: VisualDensity.compact,
                        )
                      : null,
              onTap: _authorizeCash,
            ),
            if (_pixMessage != null) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                _pixMessage!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.error,
                    ),
              ),
            ],
            if (_cardMessage != null) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                _cardMessage!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.error,
                    ),
              ),
            ],
            if (_cashMessage != null) ...[
              const SizedBox(height: RamoSpacing.xs),
              Text(
                _cashMessage!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.error,
                    ),
              ),
            ],
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
          ],
        ),
      ),
    );
  }
}

class _PayerEmailSheet extends StatefulWidget {
  const _PayerEmailSheet({required this.paymentName});

  final String paymentName;

  @override
  State<_PayerEmailSheet> createState() => _PayerEmailSheetState();
}

class _PayerEmailSheetState extends State<_PayerEmailSheet> {
  final _controller = TextEditingController();
  String? _validationMessage;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool _looksLikeEmail(String value) {
    final email = value.trim();
    final at = email.indexOf('@');
    final dot = email.lastIndexOf('.');
    return email.length >= 5 &&
        at > 0 &&
        dot > at + 1 &&
        dot < email.length - 1 &&
        !email.contains(' ');
  }

  void _submit() {
    final email = _controller.text.trim().toLowerCase();
    if (!_looksLikeEmail(email)) {
      setState(() {
        _validationMessage = 'Digite um e-mail válido.';
      });
      return;
    }

    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(email);
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.only(
        left: RamoSpacing.xl,
        right: RamoSpacing.xl,
        top: RamoSpacing.sm,
        bottom:
            MediaQuery.viewInsetsOf(context).bottom + RamoSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: RamoColors.brandYellow,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(
                Icons.alternate_email_rounded,
                color: RamoColors.brandBlack,
              ),
            ),
          ),
          const SizedBox(height: RamoSpacing.md),
          Text(
            'Só falta seu e-mail',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(
            'Precisamos dele somente para gerar o pagamento por '
            '${widget.paymentName}. Seu login continua sendo apenas pelo celular.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: RamoSpacing.lg),
          TextField(
            key: const Key('payment-email-field'),
            controller: _controller,
            autofocus: true,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autocorrect: false,
            enableSuggestions: true,
            decoration: InputDecoration(
              labelText: 'E-mail',
              hintText: 'voce@exemplo.com',
              prefixIcon: const Icon(Icons.mail_outline_rounded),
              errorText: _validationMessage,
              border: const OutlineInputBorder(),
            ),
            onChanged: (_) {
              if (_validationMessage != null) {
                setState(() => _validationMessage = null);
              }
            },
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: RamoSpacing.md),
          FilledButton(
            key: const Key('payment-email-confirm'),
            onPressed: _submit,
            style: FilledButton.styleFrom(
              backgroundColor: RamoColors.brandYellow,
              foregroundColor: RamoColors.brandBlack,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: const Text(
              'Continuar',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(
            'Usamos apenas os dados necessários para processar '
            'o pagamento com segurança.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _PixPaymentScreen extends StatefulWidget {
  const _PixPaymentScreen({
    required this.rideId,
    required this.holdExpiresAt,
    required this.result,
    required this.trackingService,
    required this.realtimeService,
    required this.networkTilesEnabled,
  });

  final String rideId;
  final DateTime holdExpiresAt;
  final PixRidePaymentResult result;
  final PassengerRideTrackingService? trackingService;
  final PassengerRideRealtimeService? realtimeService;
  final bool networkTilesEnabled;

  @override
  State<_PixPaymentScreen> createState() => _PixPaymentScreenState();
}

class _PixPaymentScreenState extends State<_PixPaymentScreen> {
  Timer? _pollTimer;
  Timer? _holdTimer;
  Duration _reservationRemaining = Duration.zero;
  bool _checking = false;
  bool _navigating = false;
  String _statusMessage = 'Aguardando confirmação do Pix…';

  @override
  void initState() {
    super.initState();
    _updateReservationRemaining();
    _holdTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateReservationRemaining(),
    );
    if (widget.trackingService != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkStatus());
      _pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => _checkStatus(),
      );
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _holdTimer?.cancel();
    super.dispose();
  }

  bool get _reservationExpired =>
      _reservationRemaining == Duration.zero;

  String get _reservationCountdown {
    final seconds = _reservationRemaining.inSeconds;
    final minutes = seconds ~/ 60;
    final rest = (seconds % 60).toString().padLeft(2, '0');
    return '$minutes:$rest';
  }

  void _updateReservationRemaining() {
    final remaining = widget.holdExpiresAt.difference(DateTime.now());
    if (!mounted) return;
    setState(() {
      _reservationRemaining =
          remaining.isNegative ? Duration.zero : remaining;
    });
  }

  Uint8List? get _qrBytes {
    final raw = widget.result.qrCodeBase64.trim();
    if (raw.isEmpty) return null;
    try {
      final value = raw.contains(',') ? raw.split(',').last : raw;
      return base64Decode(value);
    } catch (_) {
      return null;
    }
  }

  Future<void> _copyPix() async {
    if (_reservationExpired) return;
    final code = widget.result.qrCode.trim();
    if (code.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código Pix copiado.')),
    );
  }

  Future<void> _checkStatus() async {
    final tracking = widget.trackingService;
    if (
      tracking == null ||
      _checking ||
      _navigating ||
      !mounted
    ) {
      return;
    }

    _checking = true;
    try {
      final snapshot = await tracking.tracking(widget.rideId);
      if (!mounted) return;

      if (snapshot.state == 'PAYMENT_FAILED') {
        _pollTimer?.cancel();
        setState(() {
          _statusMessage =
              'Pagamento não aprovado. Volte ao início e tente novamente.';
        });
        return;
      }

      const confirmedStates = {
        'PAID',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      };

      if (!confirmedStates.contains(snapshot.state)) {
        if (mounted) {
          setState(() {
            _statusMessage = _reservationExpired
                ? 'A reserva expirou. Não faça mais este Pix. '
                    'Se você já pagou, vamos confirmar ou estornar '
                    'automaticamente.'
                : 'Aguardando confirmação do Pix…';
          });
        }
        return;
      }

      _pollTimer?.cancel();
      _navigating = true;

      final dispatchStatus = const {
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      }.contains(snapshot.state)
          ? 'NO_DRIVER_FOUND'
          : 'SEARCHING_DRIVER';

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RideTrackingScreen(
            rideId: widget.rideId,
            remainingWalletCents: null,
            paymentMethod: 'pix',
            trackingService: tracking,
            realtimeService: widget.realtimeService,
            initialDispatchStatus: dispatchStatus,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerRideTrackingException {
      if (!mounted) return;
      setState(() {
        _statusMessage = _reservationExpired
            ? 'A reserva expirou. Não faça mais este Pix. '
                'Se você já pagou, o status será atualizado automaticamente.'
            : 'Pix gerado. Estamos aguardando a confirmação do pagamento.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _statusMessage = _reservationExpired
            ? 'A reserva expirou. Não faça mais este Pix. '
                'Se você já pagou, o status será atualizado automaticamente.'
            : 'Pix gerado. A confirmação será atualizada automaticamente.';
      });
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final qrBytes = _qrBytes;
    final hasCopyCode = widget.result.qrCode.trim().isNotEmpty;
    final reservationExpired = _reservationExpired;

    return Scaffold(
      appBar: AppBar(title: const Text('Pagar com Pix')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          children: [
            Text(
              'Escaneie o QR Code',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: RamoSpacing.sm),
            Text(
              'A corrida só será enviada ao motorista depois da confirmação.',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: RamoSpacing.md),
            Text(
              reservationExpired
                  ? 'Reserva expirada · não faça mais este Pix'
                  : 'Reserva do motorista: $_reservationCountdown',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: reservationExpired
                    ? Theme.of(context).colorScheme.error
                    : null,
              ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (!reservationExpired && qrBytes != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.all(RamoSpacing.md),
                  color: Colors.white,
                  child: Image.memory(
                    qrBytes,
                    width: 260,
                    height: 260,
                    fit: BoxFit.contain,
                    gaplessPlayback: true,
                  ),
                ),
              )
            else if (!reservationExpired)
              const Center(
                child: Icon(Icons.pix_rounded, size: 96),
              )
            else
              Center(
                child: Icon(
                  Icons.timer_off_rounded,
                  size: 96,
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            const SizedBox(height: RamoSpacing.lg),
            if (!reservationExpired && hasCopyCode)
              FilledButton.icon(
                onPressed: _copyPix,
                icon: const Icon(Icons.copy_rounded),
                label: const Text('Copiar código Pix'),
              ),
            const SizedBox(height: RamoSpacing.md),
            Container(
              padding: const EdgeInsets.all(RamoSpacing.md),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(RamoRadius.md),
              ),
              child: Row(
                children: [
                  const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: RamoSpacing.sm),
                  Expanded(child: Text(_statusMessage)),
                ],
              ),
            ),
            if (widget.trackingService != null) ...[
              const SizedBox(height: RamoSpacing.sm),
              TextButton.icon(
                onPressed: _checking ? null : _checkStatus,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Atualizar confirmação'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CardPaymentStatusScreen extends StatefulWidget {
  const _CardPaymentStatusScreen({
    required this.rideId,
    required this.result,
    required this.trackingService,
    required this.realtimeService,
    required this.networkTilesEnabled,
  });

  final String rideId;
  final CardRidePaymentResult result;
  final PassengerRideTrackingService? trackingService;
  final PassengerRideRealtimeService? realtimeService;
  final bool networkTilesEnabled;

  @override
  State<_CardPaymentStatusScreen> createState() =>
      _CardPaymentStatusScreenState();
}

class _CardPaymentStatusScreenState
    extends State<_CardPaymentStatusScreen> {
  Timer? _pollTimer;
  bool _checking = false;
  bool _navigating = false;
  bool _openingChallenge = false;
  String? _error;
  late String _statusMessage;

  @override
  void initState() {
    super.initState();
    _statusMessage = widget.result.paymentConfirmed
        ? 'Pagamento confirmado.'
        : widget.result.challengeUrl != null
            ? 'Confirme a compra com seu banco para continuar.'
            : 'Estamos confirmando seu pagamento…';

    if (widget.trackingService != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkStatus());
      _pollTimer = Timer.periodic(
        const Duration(seconds: 2),
        (_) => _checkStatus(),
      );
    }

    if (widget.result.challengeUrl != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openChallenge());
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _openChallenge() async {
    final raw = widget.result.challengeUrl;
    if (raw == null || _openingChallenge || !mounted) return;

    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme != 'https') {
      setState(() {
        _error = 'Não conseguimos abrir a confirmação do banco.';
      });
      return;
    }

    setState(() {
      _openingChallenge = true;
      _error = null;
    });

    try {
      var launched = await launchUrl(
        uri,
        mode: LaunchMode.inAppBrowserView,
      );
      if (!launched) {
        launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      if (!launched && mounted) {
        setState(() {
          _error = 'Não conseguimos abrir a confirmação do banco.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Não conseguimos abrir a confirmação do banco.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _openingChallenge = false);
      }
    }
  }

  Future<void> _checkStatus() async {
    final tracking = widget.trackingService;
    if (tracking == null || _checking || _navigating || !mounted) return;

    _checking = true;
    try {
      final snapshot = await tracking.tracking(widget.rideId);
      if (!mounted) return;

      if (snapshot.state == 'PAYMENT_FAILED') {
        _pollTimer?.cancel();
        setState(() {
          _statusMessage =
              'Pagamento não aprovado. Você pode voltar e tentar novamente.';
        });
        return;
      }

      const confirmedStates = {
        'PAID',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      };

      if (!confirmedStates.contains(snapshot.state)) {
        setState(() {
          _statusMessage = widget.result.challengeUrl != null
              ? 'Aguardando a confirmação do seu banco…'
              : 'Estamos confirmando seu pagamento…';
        });
        return;
      }

      _pollTimer?.cancel();
      _navigating = true;
      final dispatchStatus = const {
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      }.contains(snapshot.state)
          ? 'NO_DRIVER_FOUND'
          : 'SEARCHING_DRIVER';

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RideTrackingScreen(
            rideId: widget.rideId,
            remainingWalletCents: null,
            paymentMethod: 'card',
            trackingService: tracking,
            realtimeService: widget.realtimeService,
            initialDispatchStatus: dispatchStatus,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerRideTrackingException {
      if (mounted) {
        setState(() {
          _statusMessage =
              'Pagamento enviado. A confirmação será atualizada automaticamente.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _statusMessage =
              'Pagamento enviado. A confirmação será atualizada automaticamente.';
        });
      }
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final challenge = widget.result.challengeUrl != null;
    final failed = _statusMessage.startsWith('Pagamento não aprovado');

    return Scaffold(
      appBar: AppBar(title: const Text('Pagamento com cartão')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 320),
                child: Icon(
                  failed
                      ? Icons.error_rounded
                      : widget.result.paymentConfirmed
                          ? Icons.check_circle_rounded
                          : challenge
                              ? Icons.verified_user_rounded
                              : Icons.credit_card_rounded,
                  key: ValueKey('$failed-${widget.result.paymentConfirmed}'),
                  size: 82,
                  color: failed
                      ? Theme.of(context).colorScheme.error
                      : RamoColors.brandYellow,
                ),
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                failed
                    ? 'Cartão não aprovado'
                    : widget.result.paymentConfirmed
                        ? 'Pagamento confirmado'
                        : challenge
                            ? 'Confirmação do banco'
                            : 'Confirmando pagamento',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _statusMessage,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              if (!failed && !widget.result.paymentConfirmed) ...[
                const SizedBox(height: RamoSpacing.lg),
                const Center(
                  child: SizedBox.square(
                    dimension: 28,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                ),
              ],
              if (challenge) ...[
                const SizedBox(height: RamoSpacing.xl),
                FilledButton.icon(
                  onPressed: _openingChallenge ? null : _openChallenge,
                  icon: const Icon(Icons.security_rounded),
                  label: Text(
                    _openingChallenge
                        ? 'Abrindo banco…'
                        : 'Confirmar com meu banco',
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: RamoSpacing.md),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ],
              if (widget.trackingService != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                TextButton.icon(
                  onPressed: _checking ? null : _checkStatus,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Atualizar status'),
                ),
              ],
              const SizedBox(height: RamoSpacing.md),
              Text(
                'Os dados do cartão são protegidos e tokenizados pelo '
                'Mercado Pago. O Ramo Nessa não recebe número completo ou CVV.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CashAuthorizedScreen extends StatelessWidget {
  const _CashAuthorizedScreen({
    required this.amountCents,
    this.dispatchStatus,
  });

  final int amountCents;
  final String? dispatchStatus;

  @override
  Widget build(BuildContext context) {
    final dispatchMessage = switch (dispatchStatus) {
      'SEARCHING_DRIVER' =>
        'Sua corrida já foi enviada ao motorista.',
      'PENDING_RETRY' =>
        'O Core vai repetir a tentativa de encontrar motorista.',
      _ => 'A corrida foi liberada para o matching.',
    };

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.payments_rounded,
                size: 82,
                color: RamoColors.signal,
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                'Pagamento em dinheiro',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                'Pague ${PreparedRide.formatCents(amountCents)} '
                'diretamente ao motorista no fim da corrida.',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.xs),
              Text(
                dispatchMessage,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
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
    super.key,
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
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 220),
      opacity: enabled ? 1 : .58,
      child: Material(
        color: dark ? RamoColors.darkRaised : RamoColors.surface,
        borderRadius: BorderRadius.circular(22),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? onTap : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            padding: const EdgeInsets.symmetric(
              horizontal: RamoSpacing.md,
              vertical: 15,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: enabled
                    ? RamoColors.brandYellow.withValues(alpha: .42)
                    : scheme.outlineVariant.withValues(alpha: .5),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: enabled
                        ? RamoColors.brandYellow
                        : scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    icon,
                    color: enabled
                        ? RamoColors.brandBlack
                        : scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: RamoSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                              height: 1.25,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: RamoSpacing.sm),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: trailing ??
                      Icon(
                        Icons.arrow_forward_ios_rounded,
                        key: ValueKey(enabled),
                        size: 17,
                        color: enabled
                            ? scheme.onSurface
                            : scheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
