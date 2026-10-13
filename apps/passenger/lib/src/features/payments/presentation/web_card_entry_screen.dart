import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:web/web.dart' as web;

import '../data/card_tokenization_service.dart';
import '../data/saved_card_service.dart';

@JS('ramoCardFields.mount')
external JSPromise<JSString> _mountFields(
  JSString options,
  JSFunction callback,
);
@JS('ramoCardFields.tokenize')
external JSPromise<JSString> _tokenizeFields(JSString data);
@JS('ramoCardFields.dispose')
external void _disposeFields(JSString containerId);

class WebCardEntryScreen extends StatefulWidget {
  const WebCardEntryScreen({
    super.key,
    required this.publicKey,
    required this.amountCents,
    required this.holdExpiresAt,
    this.requestStorageToken = false,
    this.savedCard,
  });
  final String publicKey;
  final int amountCents;
  final DateTime holdExpiresAt;
  final bool requestStorageToken;
  final SavedPassengerCard? savedCard;

  @override
  State<WebCardEntryScreen> createState() => _WebCardEntryScreenState();
}

class _WebCardEntryScreenState extends State<WebCardEntryScreen> {
  static int _sequence = 0;
  late final String _containerId = 'ramo-card-fields-${++_sequence}';
  final _holder = TextEditingController();
  final _cpf = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _ready = false, _valid = false, _busy = false, _expired = false;
  String? _error;
  Timer? _expiry;

  @override
  void initState() {
    super.initState();
    final remaining = widget.holdExpiresAt.difference(DateTime.now());
    _expired = remaining <= Duration.zero;
    if (!_expired) {
      _expiry = Timer(remaining, () {
        if (!mounted) {
          return;
        }
        _disposeBridge();
        setState(() {
          _expired = true;
          _valid = false;
          _error = 'A reserva expirou. Volte e solicite novamente.';
        });
      });
    }
  }

  void _disposeBridge() {
    try {
      _disposeFields(_containerId.toJS);
    } catch (_) {}
  }

  void _onState(JSString state) {
    if (!mounted || _expired) {
      return;
    }
    final data = jsonDecode(state.toDart) as Map<String, dynamic>;
    setState(() {
      _ready = data['ready'] == true;
      _valid = data['valid'] == true;
      _error = data['error'] as String?;
    });
  }

  Future<void> _mount(Object element) async {
    final container = element as web.HTMLDivElement;
    container.id = _containerId;
    container.style.width = '100%';
    container.style.height = '100%';
    if (_expired) {
      return;
    }
    try {
      final card = widget.savedCard;
      await _mountFields(
        jsonEncode({
          'containerId': _containerId,
          'publicKey': widget.publicKey,
          'amountCents': widget.amountCents,
          if (card != null)
            'savedCard': {
              'id': card.id,
              'lastFourDigits': card.lastFourDigits,
              'paymentMethodId': card.paymentMethodId,
              'paymentMethodType': card.paymentMethodType,
            },
        }).toJS,
        _onState.toJS,
      ).toDart;
    } catch (_) {
      if (!mounted || _expired) {
        return;
      }
      setState(
        () => _error =
            'Não conseguimos carregar o formulário seguro. Volte e tente novamente.',
      );
    }
  }

  Future<void> _continue() async {
    if (_busy || _expired || !_valid || !_form.currentState!.validate()) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final raw = await _tokenizeFields(
        jsonEncode({
          'containerId': _containerId,
          'holderName': _holder.text.trim(),
          'identificationNumber': _cpf.text,
          'requestStorageToken': widget.requestStorageToken,
        }).toJS,
      ).toDart;
      if (!mounted) {
        return;
      }
      if (_expired || !DateTime.now().isBefore(widget.holdExpiresAt)) {
        setState(
          () => _error = 'A reserva expirou. Volte e solicite novamente.',
        );
        return;
      }
      final data = jsonDecode(raw.toDart) as Map<String, dynamic>;
      final token = data['token'];
      final method = data['paymentMethodId'];
      final type = data['paymentMethodType'];
      if (token is! String ||
          token.length < 20 ||
          method is! String ||
          !const {'credit_card', 'debit_card'}.contains(type)) {
        throw const CardTokenizationException(
          'Cartão protegido inválido. Tente novamente.',
        );
      }
      Navigator.of(context).pop(
        CardTokenizationResult(
          token: token,
          paymentMethodId: method,
          paymentMethodType: type as String,
          lastFourDigits: data['lastFourDigits'] as String?,
          storageToken: data['storageToken'] as String?,
        ),
      );
    } catch (_) {
      if (mounted && !_expired) {
        setState(
          () => _error = 'Confira os dados do cartão e tente novamente.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  void dispose() {
    _expiry?.cancel();
    _disposeBridge();
    _holder.dispose();
    _cpf.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final saved = widget.savedCard;
    return Scaffold(
      appBar: AppBar(
        title: Text(saved == null ? 'Adicionar cartão' : 'Confirmar cartão'),
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              RamoReveal(
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(26),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF242424), Color(0xFF090909)],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'RAMO NESSA',
                        style: TextStyle(
                          color: RamoColors.brandYellow,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 22),
                      const Icon(
                        Icons.contactless_rounded,
                        color: RamoColors.brandYellow,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        saved == null
                            ? '••••  ••••  ••••  ••••'
                            : '••••  ••••  ••••  ${saved.lastFourDigits}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 21,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                saved == null
                    ? 'Dados do cartão'
                    : '${saved.paymentMethodId.toUpperCase()} •••• ${saved.lastFourDigits}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              const Text(
                'Pagamento à vista. Os dados são protegidos pelo Mercado Pago.',
              ),
              const SizedBox(height: 20),
              if (!_ready && !_expired) const LinearProgressIndicator(),
              if (!_expired)
                SizedBox(
                  key: ValueKey(_containerId),
                  height: saved == null ? 176 : 92,
                  child: HtmlElementView.fromTagName(
                    tagName: 'div',
                    onElementCreated: (element) => unawaited(_mount(element)),
                  ),
                ),
              if (saved == null) ...[
                const SizedBox(height: 18),
                TextFormField(
                  controller: _holder,
                  enabled: !_busy && !_expired,
                  textCapitalization: TextCapitalization.words,
                  maxLength: 100,
                  decoration: const InputDecoration(
                    labelText: 'Nome impresso no cartão',
                    counterText: '',
                  ),
                  validator: (value) => (value?.trim().length ?? 0) >= 2
                      ? null
                      : 'Informe o nome no cartão',
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _cpf,
                  enabled: !_busy && !_expired,
                  keyboardType: TextInputType.number,
                  maxLength: 11,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'CPF do titular',
                    counterText: '',
                  ),
                  validator: (value) =>
                      RegExp(r'^\d{11}$').hasMatch(value ?? '')
                      ? null
                      : 'Informe os 11 números do CPF',
                ),
              ],
              const SizedBox(height: 22),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              FilledButton(
                onPressed: _busy || _expired || !_valid ? null : _continue,
                child: _busy
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Continuar'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Você revisará o cartão antes de confirmar o pagamento. Esta etapa não cobra a corrida.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
