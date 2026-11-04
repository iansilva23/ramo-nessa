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
  static const _supportContact = String.fromEnvironment('RAMO_RECOVERY_SUPPORT_CONTACT');
  final _client = http.Client();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  final _repeatPassword = TextEditingController();
  List<String> _channels = [];
  String? _channel;
  String? _challenge;
  String? _resetToken;
  final _confirmedChannels = <String>{};
  Timer? _clock;
  DateTime? _resendAt;
  bool _showPassword = false;
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
    _clock?.cancel();
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
      final response = await _request(_confirming ? 'contact-status' : 'channels');
      final raw = response['channels'];
      if (!mounted) return;
      final choices = raw is List ? raw.whereType<String>() : <String>[];
      setState(() {
        _channels = choices.where((value) => value == 'email' || value == 'whatsapp').toList();
        _channel = _channels.length == 1 ? _channels.single : null;
        final contacts = response['contacts'];
        if (contacts is List) {
          _confirmedChannels
            ..clear()
            ..addAll(contacts.whereType<Map<String, dynamic>>()
              .where((contact) => contact['confirmed'] == true)
              .map((contact) => contact['channel']).whereType<String>());
        }
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
      _clock?.cancel();
      _resendAt = DateTime.now().add(const Duration(seconds: 60));
      _clock = Timer.periodic(const Duration(seconds: 1), (clock) {
        if (!mounted || _secondsUntilResend == 0) clock.cancel();
        if (mounted) setState(() {});
      });
      setState(() => _challenge = id);
    });
  }

  Future<void> _verifyCode() async {
    final id = _challenge;
    if (_loading || id == null) return;
    if (_code.text.trim().length != 6) {
      setState(() => _message = 'Digite os 6 números do código.');
      return;
    }
    await _perform(() async {
      final result = await _request(_confirming ? 'confirm-complete' : 'verify', {
        'challengeId': id,
        'code': _code.text.trim(),
      });
      if (result['ok'] != true) {
        throw const _RecoveryError('Não foi possível validar o código.');
      }
      final grant = result['resetToken'];
      if (!_confirming && (grant is! String || grant.isEmpty)) {
        throw const _RecoveryError('A autorização para trocar a senha não foi recebida.');
      }
      if (!mounted) return;
      _code.clear();
      _clock?.cancel();
      setState(() {
        if (_confirming) {
          _confirmedChannels.add(_channel!);
          _done = true;
        } else {
          _resetToken = grant as String;
        }
      });
    });
  }

  Future<void> _resetPassword() async {
    final id = _challenge;
    final grant = _resetToken;
    if (_loading || id == null || grant == null) return;
    if (_password.text != _repeatPassword.text) {
      setState(() => _message = 'As duas senhas precisam ser iguais.');
      return;
    }
    await _perform(() async {
      final result = await _request('reset', {
        'challengeId': id, 'resetToken': grant, 'password': _password.text,
      });
      if (result['ok'] != true) {
        throw const _RecoveryError('Não foi possível salvar a nova senha.');
      }
      if (!mounted) return;
      _password.clear();
      _repeatPassword.clear();
      setState(() {
        _resetToken = null;
        _done = true;
      });
    });
  }

  int get _secondsUntilResend {
    final deadline = _resendAt;
    if (deadline == null) return 0;
    final milliseconds = deadline.difference(DateTime.now()).inMilliseconds;
    return milliseconds <= 0 ? 0 : (milliseconds / 1000).ceil();
  }

  void _chooseAgain() {
    _clock?.cancel();
    _code.clear();
    _password.clear();
    _repeatPassword.clear();
    setState(() {
      _challenge = null;
      _resetToken = null;
      _message = null;
      _done = false;
      _showPassword = false;
    });
  }

  Widget _channelCard(String channel) {
    final colors = Theme.of(context).colorScheme;
    final selected = _channel == channel;
    final email = channel == 'email';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? colors.primaryContainer : colors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        child: ListTile(
          key: ValueKey('recovery-channel-$channel'),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          selected: selected,
          selectedColor: colors.onPrimaryContainer,
          leading: Icon(email ? Icons.alternate_email_rounded : Icons.chat_outlined),
          title: Text(_label(channel), style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(_confirming
              ? (_confirmedChannels.contains(channel) ? 'Contato confirmado' : 'Confirmação pendente')
              : (email ? 'Receba pela caixa de entrada' : 'Receba no número da conta')),
          trailing: Icon(selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded),
          onTap: _loading ? null : () => setState(() => _channel = channel),
        ),
      ),
    );
  }

  Widget _form(int step) {
    final channel = _channel;
    final resend = _secondsUntilResend;
    final colors = Theme.of(context).colorScheme;
    if (_done) {
      return Column(
        key: const ValueKey('recovery-done'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_confirming
              ? '${_label(channel!)} agora pode ser usado para recuperar sua senha.'
              : 'Sua nova senha está pronta. Use-a na próxima vez que entrar.'),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(_confirming ? 'Concluir' : 'Voltar para entrar'),
          ),
          if (_confirming && _channels.length > 1)
            TextButton(onPressed: _chooseAgain, child: const Text('Confirmar outro contato')),
        ],
      );
    }
    if (_channels.isEmpty) {
      return Column(
        key: const ValueKey('recovery-unavailable'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_loading
              ? 'Carregando canais disponíveis…'
              : 'Nenhum canal disponível agora. Confira os dados da sua conta.'),
          if (!_loading)
            TextButton(onPressed: _loadChannels, child: const Text('Tentar novamente')),
        ],
      );
    }
    if (step == 1) {
      return Column(
        key: const ValueKey('recovery-request'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_confirming
              ? 'Escolha o contato que quer confirmar para recuperar a senha.'
              : 'Informe os dados da sua conta e escolha como receber o código.'),
          const SizedBox(height: 18),
          if (_confirming)
            TextField(
              controller: _password, enabled: !_loading, obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Senha atual'),
            )
          else
            TextField(
              key: const ValueKey('recovery-identifier'),
              controller: _identifier, enabled: !_loading,
              keyboardType: TextInputType.text,
              decoration: InputDecoration(labelText: widget.driver
                  ? 'E-mail, celular com DDD ou usuário' : 'E-mail ou celular com DDD'),
            ),
          const SizedBox(height: 18),
          ..._channels.map(_channelCard),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: _loading || channel == null ? null : _send,
            child: const Text('Enviar código'),
          ),
        ],
      );
    }
    if (step == 2) {
      return Column(
        key: const ValueKey('recovery-verify'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_confirming
              ? 'O envio por ${_label(channel!)} foi aceito. Digite o código recebido.'
              : 'Se o contato estiver cadastrado na sua conta, o código chegará por ${_label(channel!)}.'),
          const SizedBox(height: 20),
          TextField(
            key: const ValueKey('recovery-code'),
            controller: _code, enabled: !_loading,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 10, color: colors.onSurface),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            decoration: const InputDecoration(labelText: 'Código de 6 dígitos', hintText: '••••••'),
            onSubmitted: (_) => _verifyCode(),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _loading ? null : _verifyCode,
            child: const Text('Validar código'),
          ),
          if (!_confirming)
            TextButton(
              onPressed: _loading || resend > 0 ? null : _send,
              child: Text(resend > 0 ? 'Reenviar em ${resend}s' : 'Reenviar código'),
            ),
          TextButton(
            onPressed: _loading ? null : _chooseAgain,
            child: const Text('Voltar e escolher outro canal'),
          ),
        ],
      );
    }
    return Column(
      key: const ValueKey('recovery-reset'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Código validado. Crie uma senha para entrar na sua conta.'),
        const SizedBox(height: 20),
        AutofillGroup(
          child: Column(
            children: [
              TextField(
                controller: _password, enabled: !_loading, obscureText: !_showPassword,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: 'Nova senha',
                  helperText: 'Pelo menos 10 caracteres, com letra e número.',
                  suffixIcon: IconButton(
                    tooltip: _showPassword ? 'Ocultar senha' : 'Mostrar senha',
                    icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                    onPressed: () => setState(() => _showPassword = !_showPassword),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _repeatPassword, enabled: !_loading, obscureText: !_showPassword,
                autofillHints: const [AutofillHints.newPassword],
                decoration: const InputDecoration(labelText: 'Repita a nova senha'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _loading ? null : _resetPassword,
          child: const Text('Salvar nova senha'),
        ),
        TextButton(onPressed: _loading ? null : _chooseAgain, child: const Text('Solicitar outro código')),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final total = _confirming ? 2 : 3;
    final step = _done ? total : _resetToken != null ? 3 : _challenge != null ? 2 : 1;
    final title = _done
        ? (_confirming ? 'Contato confirmado' : 'Senha atualizada')
        : step == 1 ? 'Escolha como receber' : step == 2 ? 'Confira seu código' : 'Crie a nova senha';
    final motion = MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 220);
    return Scaffold(
      appBar: AppBar(title: Text(_confirming ? 'Confirmar contato' : 'Recuperar senha')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.inverseSurface,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(_done ? Icons.check_circle_outline_rounded : Icons.shield_outlined,
                            color: const Color(0xFFFFD43B), size: 32),
                        const SizedBox(height: 12),
                        Text('ETAPA $step DE $total', style: theme.textTheme.labelMedium?.copyWith(color: colors.onInverseSurface)),
                        const SizedBox(height: 4),
                        Text(title, style: theme.textTheme.headlineSmall?.copyWith(
                          color: colors.onInverseSurface, fontWeight: FontWeight.w900,
                        )),
                        const SizedBox(height: 14),
                        Row(children: [
                          for (var n = 1; n <= total; n++) ...[
                            if (n > 1) const SizedBox(width: 6),
                            Expanded(child: AnimatedContainer(
                              duration: motion, height: 4,
                              decoration: BoxDecoration(
                                color: n <= step ? const Color(0xFFFFD43B) : colors.onInverseSurface.withValues(alpha: 0.24),
                                borderRadius: BorderRadius.circular(8),
                              ),
                            )),
                          ],
                        ]),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                if (_loading) const LinearProgressIndicator(),
                if (_message != null) ...[
                  Semantics(liveRegion: true, child: Text(_message!, style: TextStyle(color: colors.error))),
                  const SizedBox(height: 12),
                ],
                AnimatedSwitcher(
                  duration: motion,
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.025), end: Offset.zero).animate(animation),
                      child: child,
                    ),
                  ),
                  child: _form(step),
                ),
                if (!_confirming && !_done)
                  ExpansionTile(
                    leading: const Icon(Icons.support_agent_rounded),
                    title: const Text('Preciso de ajuda com minha conta'),
                    children: [
                      const Padding(
                        padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Text(
                          'Confira o spam do e-mail e tente o outro canal cadastrado. '
                          'Se perdeu o acesso aos dois ou cadastrou um contato errado, '
                          'procure o suporte do Ramo Nessa. Nunca compartilhe senha ou código.',
                        ),
                      ),
                      if (_supportContact.isNotEmpty)
                        ListTile(
                          title: const Text('Contato do suporte'),
                          subtitle: SelectableText(_supportContact),
                          trailing: IconButton(
                            tooltip: 'Copiar contato',
                            icon: const Icon(Icons.copy_rounded),
                            onPressed: () => Clipboard.setData(
                              const ClipboardData(text: _supportContact),
                            ),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
