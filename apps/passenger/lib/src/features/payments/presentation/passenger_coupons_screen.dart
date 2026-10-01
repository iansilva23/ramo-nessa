import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/passenger_payment_service.dart';
import '../domain/passenger_promotion.dart';
import '../../rides/domain/prepared_ride.dart';

class PassengerCouponsScreen extends StatefulWidget {
  const PassengerCouponsScreen({
    super.key,
    required this.service,
  });

  final PassengerPaymentService? service;

  @override
  State<PassengerCouponsScreen> createState() =>
      _PassengerCouponsScreenState();
}

class _PassengerCouponsScreenState
    extends State<PassengerCouponsScreen> {
  final _codeController = TextEditingController();
  PassengerPromotionPreference? _preference;
  bool _loading = true;
  bool _saving = false;
  bool _removing = false;
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final service = widget.service;
    if (service == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Cupons indisponíveis neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final preference = await service.promotionPreference();
      if (!mounted) return;
      setState(() {
        _preference = preference;
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
        _error = 'Não conseguimos consultar seus cupons agora.';
      });
    }
  }

  Future<void> _save() async {
    final service = widget.service;
    final code = _codeController.text.trim();
    if (service == null || code.length < 3 || _saving) return;

    setState(() {
      _saving = true;
      _message = null;
      _error = null;
    });

    try {
      final result = await service.savePromotionCode(code);
      if (!mounted) return;

      if (result.creditedWallet) {
        final value = result.walletCreditCents ?? 0;
        setState(() {
          _preference = null;
          _saving = false;
          _codeController.clear();
          _message = value > 0
              ? '${PreparedRide.formatCents(value)} de crédito promocional foi adicionado à sua carteira.'
              : 'Crédito promocional adicionado à sua carteira.';
        });
        return;
      }

      setState(() {
        _preference = result.preference;
        _saving = false;
        _codeController.clear();
        _message = 'Cupom salvo. Ele será aplicado automaticamente quando for válido para a corrida.';
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Não foi possível salvar esse cupom agora.';
      });
    }
  }

  Future<void> _remove() async {
    final service = widget.service;
    if (service == null || _removing) return;

    setState(() {
      _removing = true;
      _message = null;
      _error = null;
    });
    try {
      await service.clearPromotionPreference();
      if (!mounted) return;
      setState(() {
        _preference = null;
        _removing = false;
        _message = 'Cupom removido.';
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _removing = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _removing = false;
        _error = 'Não foi possível remover o cupom agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final preference = _preference;

    return Scaffold(
      appBar: AppBar(title: const Text('Cupons')),
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
            Text(
              'Seus cupons',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Salve um código aqui. Quando ele puder ser usado na sua próxima corrida, o desconto aparecerá automaticamente no pagamento.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: RamoColors.muted,
                    height: 1.4,
                  ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (preference != null)
              _CouponCard(
                preference: preference,
                removing: _removing,
                onRemove: _remove,
              )
            else
              Container(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.confirmation_number_outlined),
                    SizedBox(width: RamoSpacing.md),
                    Expanded(
                      child: Text(
                        'Nenhum cupom de corrida salvo.',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: RamoSpacing.xl),
            TextField(
              key: const Key('passenger-coupon-code'),
              controller: _codeController,
              enabled: !_saving,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Código do cupom',
                hintText: 'EX.: MARIA7',
                prefixIcon: Icon(Icons.local_offer_outlined),
              ),
              onSubmitted: (_) => _save(),
            ),
            const SizedBox(height: RamoSpacing.md),
            FilledButton(
              key: const Key('passenger-coupon-apply'),
              onPressed:
                  _saving || _codeController.text.trim().length < 3
                      ? _saving
                          ? null
                          : _save
                      : _save,
              child: _saving
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Adicionar cupom'),
            ),
            if (_message != null) ...[
              const SizedBox(height: RamoSpacing.md),
              _MessageBox(
                message: _message!,
                success: true,
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.md),
              _MessageBox(
                message: _error!,
                success: false,
              ),
            ],
            const SizedBox(height: RamoSpacing.lg),
            Text(
              'Cupons de crédito entram direto na Carteira Ramo Nessa. Cupons de desconto e de corrida promocional ficam salvos para uma corrida compatível.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: RamoColors.muted,
                    height: 1.4,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CouponCard extends StatelessWidget {
  const _CouponCard({
    required this.preference,
    required this.removing,
    required this.onRemove,
  });

  final PassengerPromotionPreference preference;
  final bool removing;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final campaign = preference.campaign;
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.brandYellow.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        border: Border.all(
          color: RamoColors.brandYellow.withValues(alpha: .55),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.confirmation_number_rounded),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                child: Text(
                  campaign.code,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    letterSpacing: .8,
                  ),
                ),
              ),
              TextButton(
                onPressed: removing ? null : onRemove,
                child: Text(removing ? 'Removendo…' : 'Remover'),
              ),
            ],
          ),
          const SizedBox(height: RamoSpacing.sm),
          Text(
            campaign.name,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            campaign.benefitLabel,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({
    required this.message,
    required this.success,
  });

  final String message;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: success
            ? colors.primaryContainer.withValues(alpha: .55)
            : colors.errorContainer,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: success
              ? colors.onPrimaryContainer
              : colors.onErrorContainer,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
