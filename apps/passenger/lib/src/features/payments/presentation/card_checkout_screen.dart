import 'dart:async';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import '../data/card_tokenization_service.dart';
import '../data/saved_card_service.dart';

class CardCheckoutSelection {
  const CardCheckoutSelection(this.card, this.email, this.savedCardId);
  final CardTokenizationResult card;
  final String email;
  final String? savedCardId;
}

class CardCheckoutScreen extends StatefulWidget {
  const CardCheckoutScreen({
    super.key,
    required this.tokenizer,
    required this.amountLabel,
    required this.holdExpiresAt,
    this.cards,
    this.initialEmail = '',
  });
  final CardTokenizationService tokenizer;
  final SavedCardService? cards;
  final String initialEmail;
  final String amountLabel;
  final DateTime holdExpiresAt;
  @override
  State<CardCheckoutScreen> createState() => _CardCheckoutScreenState();
}

class _CardCheckoutScreenState extends State<CardCheckoutScreen> {
  final _email = TextEditingController();
  final _form = GlobalKey<FormState>();
  List<SavedPassengerCard> _cards = [];
  SavedPassengerCard? _selected;
  CardTokenizationResult? _newCard;
  bool _busy = false, _save = false, _loading = true;
  String? _error;
  Timer? _timer;
  bool get _expired => !DateTime.now().isBefore(widget.holdExpiresAt);
  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail;
    unawaited(_load());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _load() async {
    try {
      final cards = await widget.cards?.savedCards() ?? <SavedPassengerCard>[];
      if (mounted) {
        setState(() {
          _cards = cards;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Não conseguimos carregar seus cartões. Você pode adicionar outro.',
        );
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _email.dispose();
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _add() async {
    if (_busy || _expired || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final tokenizer = widget.tokenizer;
      final token = _save && tokenizer is StorageCardTokenizationService
          ? await (tokenizer as StorageCardTokenizationService)
                .tokenizeForStorage()
          : await tokenizer.tokenize();
      if (!mounted) return;
      // Saving and paying use different one-use tokens from the secure SDK fields.
      if (_save && widget.cards != null && token.storageToken != null) {
        try {
          await widget.cards!.saveCard(
            token: token.storageToken!,
            payerEmail: _email.text.trim(),
          );
        } catch (_) {
          if (mounted) {
            setState(
              () => _error =
                  'O cartão está pronto para esta corrida, mas não foi salvo.',
            );
          }
        }
      } else if (_save) {
        setState(
          () => _error =
              'Esta instalação permite pagar, mas ainda não salvar o cartão.',
        );
      }
      if (mounted) {
        setState(() {
          _newCard = token;
          _selected = null;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is CardTokenizationException
              ? error.message
              : 'Não conseguimos adicionar este cartão.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    if (_busy || _expired || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      var token = _newCard;
      if (_selected != null) {
        final tokenizer = widget.tokenizer;
        if (tokenizer is! SavedCardTokenizationService) {
          throw const CardTokenizationException(
            'Atualize o app para usar cartões salvos.',
          );
        }
        token = await (tokenizer as SavedCardTokenizationService)
            .tokenizeSavedCard(_selected!);
      }
      if (!mounted) return;
      if (_expired) {
        setState(
          () => _error = 'A reserva expirou. Volte e solicite novamente.',
        );
        return;
      }
      if (token != null) {
        Navigator.of(
          context,
        ).pop(CardCheckoutSelection(token, _email.text.trim(), _selected?.id));
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is CardTokenizationException
              ? error.message
              : 'Não conseguimos validar o cartão.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(SavedPassengerCard card) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.cards!.removeCard(card.id);
      if (mounted) {
        setState(() {
          _cards.removeWhere((c) => c.id == card.id);
          if (_selected?.id == card.id) _selected = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Não conseguimos remover o cartão. Tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = widget.holdExpiresAt
        .difference(DateTime.now())
        .inSeconds
        .clamp(0, 9999);
    final card = _newCard;
    return Scaffold(
      appBar: AppBar(title: const Text('Seu cartão')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              RamoReveal(
                child: Container(
                  padding: const EdgeInsets.all(24),
                  height: 185,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(26),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF242424), Color(0xFF090909)],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'RAMO NESSA',
                            style: TextStyle(
                              color: RamoColors.brandYellow,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            (_selected?.paymentMethodId ??
                                    card?.paymentMethodId ??
                                    'CARTÃO')
                                .toUpperCase(),
                            style: const TextStyle(color: Colors.white),
                          ),
                        ],
                      ),
                      const Spacer(),
                      const Icon(
                        Icons.contactless_rounded,
                        color: RamoColors.brandYellow,
                      ),
                      const SizedBox(height: 12),
                      AnimatedSwitcher(
                        duration: MediaQuery.disableAnimationsOf(context)
                            ? Duration.zero
                            : const Duration(milliseconds: 240),
                        child: Text(
                          '••••  ••••  ••••  ${_selected?.lastFourDigits ?? card?.lastFourDigits ?? '••••'}',
                          key: ValueKey(_selected?.id ?? card?.lastFourDigits),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 21,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Revise e confirme',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                'Valor da corrida: ${widget.amountLabel}',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _expired
                    ? 'Reserva expirada. Volte para procurar novamente.'
                    : 'Motorista reservado por ${remaining ~/ 60}:${(remaining % 60).toString().padLeft(2, '0')}',
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                enabled: !_busy,
                decoration: const InputDecoration(
                  labelText: 'E-mail para o pagamento',
                ),
                validator: (value) =>
                    RegExp(
                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                    ).hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Informe um e-mail válido',
              ),
              const SizedBox(height: 16),
              if (_loading) const LinearProgressIndicator(),
              for (final saved in _cards)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    _selected?.id == saved.id
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  title: Text(
                    '${saved.paymentMethodId.toUpperCase()} •••• ${saved.lastFourDigits}',
                  ),
                  onTap: _busy
                      ? null
                      : () => setState(() {
                          _selected = saved;
                          _newCard = null;
                        }),
                  trailing: IconButton(
                    tooltip: 'Remover cartão',
                    onPressed: _busy ? null : () => _remove(saved),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ),
              if (widget.cards != null && _newCard == null)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Salvar cartão para próximas corridas'),
                  value: _save,
                  onChanged: _busy
                      ? null
                      : (value) => setState(() => _save = value),
                ),
              OutlinedButton.icon(
                onPressed: _busy || _expired ? null : _add,
                icon: const Icon(Icons.add_rounded),
                label: Text(
                  card == null ? 'Adicionar cartão' : 'Trocar cartão',
                ),
              ),
              const SizedBox(height: 16),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              FilledButton(
                onPressed:
                    _busy || _expired || (_selected == null && card == null)
                    ? null
                    : _confirm,
                child: _busy
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text('Pagar ${widget.amountLabel}'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Adicionar um cartão não cobra a corrida. O pagamento começa somente após sua confirmação.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
