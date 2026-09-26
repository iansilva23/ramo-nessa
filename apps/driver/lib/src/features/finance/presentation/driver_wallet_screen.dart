import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';
import 'driver_statement_screen.dart';

class DriverWalletScreen extends StatefulWidget {
  const DriverWalletScreen({
    super.key,
    required this.api,
    this.initialFinance,
  });

  final DriverApi api;
  final DriverFinanceSummary? initialFinance;

  @override
  State<DriverWalletScreen> createState() => _DriverWalletScreenState();
}

class _DriverWalletScreenState extends State<DriverWalletScreen> {
  DriverFinanceSummary? _finance;
  DriverPayoutDestination? _payoutDestination;
  bool _loading = false;
  bool _savingPix = false;
  bool _requestingPayout = false;
  String? _error;
  String? _pendingIdempotencyKey;
  int? _pendingAmountCents;

  @override
  void initState() {
    super.initState();
    _finance = widget.initialFinance;
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final finance = await widget.api.financeSummary();
      final payoutDestination = await widget.api.payoutDestination();
      if (!mounted) return;
      setState(() {
        _finance = finance;
        _payoutDestination = payoutDestination;
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
        _error = 'Não conseguimos atualizar sua carteira agora.';
      });
    }
  }

  Future<void> _configurePix() async {
    if (_savingPix) return;

    var keyType = _payoutDestination?.pixKeyType ?? 'cpf';
    final controller = TextEditingController();

    final submitted = await showDialog<({String type, String key})>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            _payoutDestination?.configured == true
                ? 'Alterar chave Pix'
                : 'Cadastrar chave Pix',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: keyType,
                decoration: const InputDecoration(
                  labelText: 'Tipo da chave',
                ),
                items: const [
                  DropdownMenuItem(value: 'cpf', child: Text('CPF')),
                  DropdownMenuItem(value: 'cnpj', child: Text('CNPJ')),
                  DropdownMenuItem(value: 'email', child: Text('E-mail')),
                  DropdownMenuItem(value: 'phone', child: Text('Celular')),
                  DropdownMenuItem(
                    value: 'random',
                    child: Text('Chave aleatória'),
                  ),
                ],
                onChanged: (value) {
                  if (value == null) return;
                  setDialogState(() => keyType = value);
                },
              ),
              const SizedBox(height: RamoSpacing.md),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType: switch (keyType) {
                  'cpf' || 'cnpj' || 'phone' => TextInputType.phone,
                  'email' => TextInputType.emailAddress,
                  _ => TextInputType.text,
                },
                decoration: InputDecoration(
                  labelText: 'Chave Pix',
                  hintText: switch (keyType) {
                    'cpf' => '000.000.000-00',
                    'cnpj' => '00.000.000/0000-00',
                    'email' => 'nome@email.com',
                    'phone' => '(88) 99999-9999',
                    _ => 'Cole sua chave aleatória',
                  },
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              const Text(
                'O saque só será enviado para a chave Pix cadastrada '
                'no momento da solicitação.',
                style: TextStyle(
                  color: RamoColors.muted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                final key = controller.text.trim();
                if (key.isEmpty) return;
                Navigator.of(dialogContext).pop(
                  (type: keyType, key: key),
                );
              },
              child: const Text('Salvar'),
            ),
          ],
        ),
      ),
    );

    controller.dispose();
    if (submitted == null || !mounted) return;

    setState(() {
      _savingPix = true;
      _error = null;
    });

    try {
      final destination = await widget.api.savePayoutDestination(
        pixKeyType: submitted.type,
        pixKey: submitted.key,
      );
      if (!mounted) return;
      setState(() {
        _payoutDestination = destination;
        _savingPix = false;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Chave Pix salva com segurança.')),
        );
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _savingPix = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _savingPix = false;
        _error = 'Não conseguimos salvar sua chave Pix agora.';
      });
    }
  }

  Future<void> _requestPayout() async {
    final finance = _finance;
    if (_payoutDestination?.configured != true) {
      setState(() {
        _error = 'Cadastre uma chave Pix antes de solicitar o saque.';
      });
      return;
    }
    if (finance == null ||
        finance.availableBalanceCents <= 0 ||
        _requestingPayout) {
      return;
    }

    final amount = _pendingAmountCents ?? finance.availableBalanceCents;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Solicitar saque?'),
        content: Text(
          'Vamos reservar ${formatCents(amount)} do seu saldo disponível '
          'para repasse.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Solicitar'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final key = _pendingIdempotencyKey ??=
        'driver-payout-${DateTime.now().microsecondsSinceEpoch}';
    _pendingAmountCents ??= amount;

    setState(() {
      _requestingPayout = true;
      _error = null;
    });

    try {
      final result = await widget.api.requestPayout(
        amountCents: amount,
        idempotencyKey: key,
      );
      if (!mounted) return;
      setState(() {
        _finance = result.finance;
        _requestingPayout = false;
        _pendingIdempotencyKey = null;
        _pendingAmountCents = null;
      });

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Saque solicitado: ${formatCents(result.amountCents)}.',
            ),
          ),
        );
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _requestingPayout = false;
        _pendingIdempotencyKey = null;
        _pendingAmountCents = null;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _requestingPayout = false;
        _error =
            'Não foi possível confirmar o saque. Tente novamente; '
            'a mesma solicitação será reutilizada com segurança.';
      });
    }
  }

  Future<void> _openStatement() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DriverStatementScreen(api: widget.api),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final finance = _finance;
    final available = finance?.availableBalanceCents ?? 0;
    final pending = finance?.payoutPendingCents ?? 0;
    final debt = finance?.cashCommissionDebtCents ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Carteira')),
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
            Container(
              padding: const EdgeInsets.all(RamoSpacing.lg),
              decoration: BoxDecoration(
                color: RamoColors.brandBlack,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Saldo disponível',
                    style: TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _loading && finance == null
                        ? 'Carregando…'
                        : formatCents(available),
                    style: Theme.of(context)
                        .textTheme
                        .headlineMedium
                        ?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: RamoSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: _WalletMetric(
                          label: 'Em processamento',
                          value: formatCents(pending),
                        ),
                      ),
                      if (debt > 0) ...[
                        const SizedBox(width: RamoSpacing.sm),
                        Expanded(
                          child: _WalletMetric(
                            label: 'Taxa pendente',
                            value: formatCents(debt),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: RamoSpacing.md),
            Container(
              padding: const EdgeInsets.all(RamoSpacing.md),
              decoration: BoxDecoration(
                color: RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(RamoRadius.md),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: RamoColors.brandYellow,
                    foregroundColor: RamoColors.brandBlack,
                    child: Icon(Icons.pix_rounded),
                  ),
                  const SizedBox(width: RamoSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Chave Pix para saque',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _payoutDestination?.configured == true
                              ? '${_payoutDestination!.typeLabel} · '
                                  '${_payoutDestination!.pixKeyMasked}'
                              : 'Nenhuma chave cadastrada',
                          style: const TextStyle(
                            color: RamoColors.muted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: _savingPix ? null : _configurePix,
                    child: _savingPix
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            _payoutDestination?.configured == true
                                ? 'Alterar'
                                : 'Cadastrar',
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
            FilledButton.icon(
              onPressed: available > 0 &&
                      !_requestingPayout &&
                      _payoutDestination?.configured == true
                  ? _requestPayout
                  : null,
              icon: const Icon(Icons.account_balance_rounded),
              label: _requestingPayout
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Solicitar saque'),
            ),
            const SizedBox(height: RamoSpacing.sm),
            OutlinedButton.icon(
              onPressed: _openStatement,
              icon: const Icon(Icons.receipt_long_rounded),
              label: const Text('Ver extrato de ganhos'),
            ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'Como funciona',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            const _WalletInfoTile(
              icon: Icons.check_circle_outline_rounded,
              title: 'Corridas digitais',
              subtitle:
                  'O valor líquido entra no saldo depois que a corrida é concluída.',
            ),
            const _WalletInfoTile(
              icon: Icons.payments_outlined,
              title: 'Corridas em dinheiro',
              subtitle:
                  'A taxa de uso do app aparece somente aqui e no extrato. '
                  'Se necessário, ela é compensada pelos próximos recebimentos.',
            ),
            const _WalletInfoTile(
              icon: Icons.account_balance_outlined,
              title: 'Saques',
              subtitle:
                  'A solicitação reserva o saldo com idempotência. '
                  'O envio Pix real depende da conexão do provedor de repasses.',
            ),
          ],
        ),
      ),
    );
  }
}

class _WalletMetric extends StatelessWidget {
  const _WalletMetric({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletInfoTile extends StatelessWidget {
  const _WalletInfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(icon, color: RamoColors.brandBlack),
      ),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(subtitle),
    );
  }
}
