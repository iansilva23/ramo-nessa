import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

class RamoPasswordRecovery extends StatefulWidget {
  const RamoPasswordRecovery({
    super.key,
    required this.baseUri,
    required this.driver,
    this.accessToken,
  });

  final Uri baseUri;
  final bool driver;
  final String? accessToken;

  @override
  State<RamoPasswordRecovery> createState() => _RamoPasswordRecoveryState();
}

class _RecoveryError implements Exception {
  const _RecoveryError(this.message);

  final String message;
}

class _RamoPasswordRecoveryState extends State<RamoPasswordRecovery> {
  final _client = http.Client();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  final _repeatPassword = TextEditingController();
  List<String> _channels = [];
  String? _channel;
  String? _challenge;
  String? _message;
  bool _loading = true;
  bool _done = false;

  bool get _confirming => widget.accessToken != null;

  String _label(String channel) => channel == 'email' ? 'E-mail' : 'WhatsApp';

  @override
  void initState() {
    super.initState();
    unawaited(_loadChannels());
  }

  @override
  void dispose() {
    _client.close();
    _identifier.dispose();
    _password.dispose();
    _code.dispose();
    _repeatPassword.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _request(
    String action, [
    Map<String, String>? payload,
  ]) async {
    final role = widget.driver ? 'driver' : 'passenger';
    final url = widget.baseUri.resolve('/v1/auth/$role/recovery/$action');
    final headers = {
      if (payload != null) 'content-type': 'application/json',
      if (_confirming) 'authorization': 'Bearer ${widget.accessToken}',
    };
    final response = await (payload == null
            ? _client.get(url, headers: headers)
            : _client.post(url, headers: headers, body: jsonEncode(payload)))
        .timeout(const Duration(seconds: 15));
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw const _RecoveryError('Resposta indisponível. Tente novamente.');
    }
    if (response.statusCode >= 400) {
      final seconds = decoded['retryAfterSeconds'];
      if (response.statusCode == 429 && seconds is int && seconds > 0) {
        final wait = seconds < 60
            ? '$seconds segundos'
            : '${(seconds / 60).ceil()} min';
        throw _RecoveryError('Aguarde $wait antes de tentar novamente neste canal.');
      }
      final message = decoded['message'];
      throw _RecoveryError(
        message is String && message.isNotEmpty
            ? message
            : 'Não foi possível continuar. Tente novamente.',
      );
    }
    return decoded;
  }

  Future<void> _loadChannels() async {
    await _perform(() async {
      final response = await _request('channels');
      final raw = response['channels'];
      if (!mounted) return;
      final choices = raw is List ? raw.whereType<String>() : <String>[];
      setState(() {
        _channels = choices.where((value) => value == 'email' || value == 'whatsapp').toList();
        _channel = _channels.length == 1 ? _channels.single : null;
      });
    });
  }

  Future<void> _perform(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      await action();
    } on _RecoveryError catch (error) {
      if (mounted) setState(() => _message = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Conexão indisponível. Tente novamente.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final channel = _channel;
    if (_loading || channel == null) return;
    final identifier = _identifier.text.trim();
    final password = _password.text;
    if (_confirming ? password.isEmpty : identifier.isEmpty) {
      setState(() => _message = _confirming
          ? 'Informe sua senha atual.'
          : 'Informe o acesso da sua conta.');
      return;
    }
    await _perform(() async {
      final response = await _request(_confirming ? 'confirm-request' : 'request', {
        'channel': channel,
        if (_confirming) 'password': password else 'identifier': identifier,
      });
      final id = response['challengeId'];
      if (id is! String || id.isEmpty) {
        throw const _RecoveryError('Não foi possível iniciar o envio. Tente novamente.');
      }
      if (!mounted) return;
      _password.clear();
      _code.clear();
      setState(() => _challenge = id);
    });
  }

  Future<void> _complete() async {
    final id = _challenge;
    if (_loading || id == null) return;
    if (_code.text.trim().length != 6) {
      setState(() => _message = 'Digite os 6 números do código.');
      return;
    }
    if (!_confirming && _password.text != _repeatPassword.text) {
      setState(() => _message = 'As duas senhas precisam ser iguais.');
      return;
    }
    await _perform(() async {
      final result = await _request(_confirming ? 'confirm-complete' : 'complete', {
        'challengeId': id,
        'code': _code.text.trim(),
        if (!_confirming) 'password': _password.text,
      });
      if (result['ok'] != true) {
        throw const _RecoveryError('Não foi possível concluir. Tente novamente.');
      }
      if (!mounted) return;
      _password.clear();
      _repeatPassword.clear();
      _code.clear();
      setState(() => _done = true);
    });
  }

  void _chooseAgain() {
    _code.clear();
    _password.clear();
    _repeatPassword.clear();
    setState(() {
      _challenge = null;
      _message = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final channel = _channel;
    return Scaffold(
      appBar: AppBar(title: Text(_confirming ? 'Confirmar contato' : 'Recuperar senha')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                if (_loading) const LinearProgressIndicator(),
                if (_done) ...[
                  Text(_confirming
                      ? '${_label(channel!)} confirmado para recuperação de senha.'
                      : 'Senha redefinida. Entre com sua nova senha.'),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(_confirming ? 'Concluir' : 'Voltar para entrar'),
                  ),
                  if (_confirming && _channels.length > 1)
                    TextButton(
                      onPressed: () {
                        _chooseAgain();
                        setState(() {
                          _done = false;
                          _channel = null;
                        });
                      },
                      child: const Text('Confirmar outro contato'),
                    ),
                ] else if (_channels.isEmpty) ...[
                  if (!_loading)
                    const Text('Nenhum canal de recuperação está disponível agora.'),
                  if (!_loading)
                    TextButton(onPressed: _loadChannels, child: const Text('Tentar novamente')),
                ] else if (_challenge == null) ...[
                  Text(
                    _confirming
                        ? 'Confirme seu e-mail e WhatsApp para poder escolher onde receber o código se esquecer a senha.'
                        : 'Escolha onde quer receber o código. O contato precisa ter sido confirmado na sua conta.',
                  ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 12,
                    children: [
                      for (final choice in _channels)
                        ChoiceChip(
                          key: ValueKey('recovery-channel-$choice'),
                          label: Text(_label(choice)),
                          selected: choice == channel,
                          onSelected: _loading
                              ? null
                              : (_) => setState(() => _channel = choice),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_confirming)
                    TextField(
                      controller: _password,
                      enabled: !_loading,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Senha atual'),
                    )
                  else
                    TextField(
                      controller: _identifier,
                      enabled: !_loading,
                      keyboardType: widget.driver ? TextInputType.text : TextInputType.emailAddress,
                      decoration: InputDecoration(labelText: widget.driver ? 'Usuário ou e-mail' : 'E-mail'),
                    ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading || channel == null ? null : _send,
                    child: const Text('Enviar código'),
                  ),
                ] else ...[
                  Text(_confirming
                      ? 'Digite o código de confirmação do canal escolhido.'
                      : 'Se o contato estiver confirmado, o código chegará por ${_label(channel!)}.'),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _code,
                    enabled: !_loading,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    decoration: const InputDecoration(labelText: 'Código de 6 dígitos'),
                  ),
                  if (!_confirming) ...[
                    const SizedBox(height: 16),
                    TextField(
                      controller: _password,
                      enabled: !_loading,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Nova senha',
                        helperText: 'Use pelo menos 10 caracteres, com letra e número.',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _repeatPassword,
                      enabled: !_loading,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Confirme a nova senha'),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _complete,
                    child: Text(_confirming ? 'Confirmar contato' : 'Salvar nova senha'),
                  ),
                  TextButton(
                    onPressed: _loading ? null : _chooseAgain,
                    child: Text(_channels.length > 1 ? 'Escolher outro canal ou reenviar' : 'Voltar para reenviar'),
                  ),
                  if (!_confirming)
                    const Text('Sem acesso aos contatos confirmados? Procure o suporte do Ramo Nessa.'),
                ],
                if (_message != null) ...[
                  const SizedBox(height: 12),
                  Text(_message!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
