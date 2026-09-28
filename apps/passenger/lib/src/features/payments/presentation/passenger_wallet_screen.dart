import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/passenger_payment_service.dart';
import '../domain/wallet_topup_result.dart';

class PassengerWalletScreen extends StatefulWidget {
  const PassengerWalletScreen({
    super.key,
    required this.service,
  });

  final PassengerPaymentService service;

  @override
  State<PassengerWalletScreen> createState() => _PassengerWalletScreenState();
}

class _PassengerWalletScreenState extends State<PassengerWalletScreen> {
  int? _balanceCents;
  List<WalletTopupStatus> _topups = const [];
  bool _loading = true;
  bool _creating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final values = await Future.wait<Object>([
        widget.service.walletBalanceCents(),
        widget.service.walletTopups(limit: 30),
      ]);
      if (!mounted) return;
      setState(() {
        _balanceCents = values[0] as int;
        _topups = values[1] as List<WalletTopupStatus>;
        _loading = false;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar sua carteira agora.';
      });
    }
  }

  Future<void> _newTopup() async {
    if (_creating) return;

    final amountController = TextEditingController();
    final emailController = TextEditingController();

    final input = await showDialog<_WalletTopupInput>(
      context: context,
      builder: (context) {
        String? validationError;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            void submit() {
              final normalized =
                  amountController.text.trim().replaceAll(',', '.');
              final reais = double.tryParse(normalized);
              final email = emailController.text.trim().toLowerCase();

              if (reais == null || reais < 1 || reais > 10000) {
                setDialogState(() {
                  validationError =
                      'Informe um valor entre R\$ 1,00 e R\$ 10.000,00.';
                });
                return;
              }
              if (
                email.length < 5 ||
                email.length > 254 ||
                !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)
              ) {
                setDialogState(() {
                  validationError =
                      'Informe um e-mail válido para gerar o Pix.';
                });
                return;
              }

              Navigator.of(context).pop(
                _WalletTopupInput(
                  amountCents: (reais * 100).round(),
                  payerEmail: email,
                ),
              );
            }

            return AlertDialog(
              title: const Text('Adicionar saldo via Pix'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'A recarga da Carteira Ramo Nessa é feita somente por Pix.',
                    ),
                    const SizedBox(height: RamoSpacing.md),
                    TextField(
                      controller: amountController,
                      autofocus: true,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[0-9,.]'),
                        ),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Valor da recarga',
                        prefixText: 'R\$ ',
                        hintText: '50,00',
                      ),
                    ),
                    const SizedBox(height: RamoSpacing.md),
                    TextField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'E-mail para o pagamento',
                        hintText: 'voce@exemplo.com',
                      ),
                      onSubmitted: (_) => submit(),
                    ),
                    if (validationError != null) ...[
                      const SizedBox(height: RamoSpacing.sm),
                      Text(
                        validationError!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  onPressed: submit,
                  child: const Text('Gerar Pix'),
                ),
              ],
            );
          },
        );
      },
    );

    amountController.dispose();
    emailController.dispose();
    if (input == null || !mounted) return;

    setState(() {
      _creating = true;
      _error = null;
    });

    try {
      final result = await widget.service.createPixWalletTopup(
        amountCents: input.amountCents,
        payerEmail: input.payerEmail,
        idempotencyKey:
            'wallet-pix-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (!mounted) return;
      setState(() => _creating = false);

      final paid = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => _PixWalletTopupScreen(
            service: widget.service,
            result: result,
          ),
        ),
      );
      if (!mounted) return;
      if (paid == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Recarga confirmada. Saldo atualizado.'),
          ),
        );
      }
      await _load();
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = 'Não conseguimos gerar a recarga Pix agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final balance = _balanceCents;

    return Scaffold(
      appBar: AppBar(title: const Text('Carteira Ramo Nessa')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(RamoSpacing.lg),
          children: [
            Container(
              padding: const EdgeInsets.all(RamoSpacing.xl),
              decoration: BoxDecoration(
                color: RamoColors.brandBlack,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Saldo disponível',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    balance == null ? '—' : _formatCents(balance),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1.2,
                    ),
                  ),
                  const SizedBox(height: RamoSpacing.md),
                  FilledButton.icon(
                    onPressed: _creating ? null : _newTopup,
                    icon: _creating
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.pix_rounded),
                    label: Text(
                      _creating ? 'Gerando Pix…' : 'Adicionar saldo via Pix',
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.md),
              Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: RamoSpacing.xl),
            Text(
              'Histórico de recargas',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            if (_loading && _topups.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_topups.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Text(
                  'Você ainda não fez nenhuma recarga.',
                  style: TextStyle(color: RamoColors.muted),
                ),
              )
            else
              ..._topups.map(
                (topup) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    backgroundColor: RamoColors.surfaceRaised,
                    child: Icon(
                      Icons.pix_rounded,
                      color: RamoColors.brandBlack,
                    ),
                  ),
                  title: Text(
                    _formatCents(topup.amountCents),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(_formatDate(topup.createdAt)),
                  trailing: _TopupStatusBadge(status: topup.status),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PixWalletTopupScreen extends StatefulWidget {
  const _PixWalletTopupScreen({
    required this.service,
    required this.result,
  });

  final PassengerPaymentService service;
  final PixWalletTopupResult result;

  @override
  State<_PixWalletTopupScreen> createState() =>
      _PixWalletTopupScreenState();
}

class _PixWalletTopupScreenState extends State<_PixWalletTopupScreen> {
  Timer? _pollTimer;
  bool _checking = false;
  WalletTopupStatus? _status;
  String _message = 'Aguardando confirmação do Pix…';

  @override
  void initState() {
    super.initState();
    _status = widget.result.topup;
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
    _pollTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _check(),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Uint8List? get _qrBytes {
    final raw = widget.result.qrCodeBase64.trim();
    if (raw.isEmpty) return null;
    try {
      final normalized = raw.contains(',') ? raw.split(',').last : raw;
      return base64Decode(normalized);
    } catch (_) {
      return null;
    }
  }

  Future<void> _copyPix() async {
    final code = widget.result.qrCode.trim();
    if (code.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código Pix copiado.')),
    );
  }

  Future<void> _check() async {
    if (_checking || !mounted) return;
    _checking = true;
    try {
      final status = await widget.service.walletTopupStatus(
        widget.result.topup.id,
      );
      if (!mounted) return;
      setState(() {
        _status = status;
        if (status.paid) {
          _message = 'Pagamento confirmado. O saldo já está disponível.';
        } else if (status.status == 'failed') {
          _message = 'O pagamento não foi aprovado.';
        } else if (status.status == 'cancelled') {
          _message = 'A recarga foi cancelada.';
        } else if (status.status == 'refunded') {
          _message = 'A recarga foi estornada.';
        } else {
          _message = 'Aguardando confirmação do Pix…';
        }
      });
      if (status.paid || status.terminalFailure) {
        _pollTimer?.cancel();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _message =
              'Pix gerado. A confirmação será atualizada automaticamente.';
        });
      }
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status ?? widget.result.topup;
    final qrBytes = _qrBytes;

    return Scaffold(
      appBar: AppBar(title: const Text('Recarga via Pix')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          children: [
            Text(
              _formatCents(status.amountCents),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            const Text(
              'Escaneie o QR Code ou copie o código Pix.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (!status.paid && !status.terminalFailure && qrBytes != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.all(RamoSpacing.md),
                  color: Colors.white,
                  child: Image.memory(
                    qrBytes,
                    width: 250,
                    height: 250,
                    fit: BoxFit.contain,
                    gaplessPlayback: true,
                  ),
                ),
              )
            else
              Center(
                child: Icon(
                  status.paid
                      ? Icons.check_circle_rounded
                      : status.terminalFailure
                          ? Icons.error_outline_rounded
                          : Icons.pix_rounded,
                  size: 96,
                  color: status.paid
                      ? RamoColors.brandBlack
                      : status.terminalFailure
                          ? Theme.of(context).colorScheme.error
                          : RamoColors.brandBlack,
                ),
              ),
            const SizedBox(height: RamoSpacing.lg),
            if (
              !status.paid &&
              !status.terminalFailure &&
              widget.result.qrCode.trim().isNotEmpty
            )
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
                  if (!status.paid && !status.terminalFailure)
                    const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    Icon(
                      status.paid
                          ? Icons.verified_rounded
                          : Icons.info_outline_rounded,
                    ),
                  const SizedBox(width: RamoSpacing.sm),
                  Expanded(child: Text(_message)),
                ],
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            if (!status.paid && !status.terminalFailure)
              TextButton.icon(
                onPressed: _checking ? null : _check,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Atualizar confirmação'),
              ),
            if (status.paid || status.terminalFailure) ...[
              const SizedBox(height: RamoSpacing.md),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(status.paid),
                child: const Text('Voltar para a carteira'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WalletTopupInput {
  const _WalletTopupInput({
    required this.amountCents,
    required this.payerEmail,
  });

  final int amountCents;
  final String payerEmail;
}

class _TopupStatusBadge extends StatelessWidget {
  const _TopupStatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'paid' => 'Confirmada',
      'failed' => 'Falhou',
      'cancelled' => 'Cancelada',
      'refunded' => 'Estornada',
      _ => 'Pendente',
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: status == 'paid'
            ? RamoColors.brandYellow
            : RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.pill),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w900,
          color: RamoColors.brandBlack,
        ),
      ),
    );
  }
}

String _formatCents(int cents) {
  final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
  return 'R\$ $value';
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day/$month/${local.year} · $hour:$minute';
}
