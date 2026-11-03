import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../config/driver_core_config.dart';
import 'auth_token_store.dart';
import 'driver_password_auth_service.dart';
import 'driver_password_setup_screen.dart';
import 'phone_auth_service.dart';
import 'phone_login_screen.dart';

enum _Step { login, recovery, reset }

class DriverPasswordLoginScreen extends StatefulWidget {
  const DriverPasswordLoginScreen({
    super.key,
    required this.phoneService,
    required this.passwordService,
    required this.tokenStore,
    required this.onAuthenticated,
  });
  final PhoneAuthService phoneService;
  final DriverPasswordAuthService passwordService;
  final AuthTokenStore tokenStore;
  final ValueChanged<String> onAuthenticated;
  @override
  State<DriverPasswordLoginScreen> createState() =>
      _DriverPasswordLoginScreenState();
}

class _DriverPasswordLoginScreenState extends State<DriverPasswordLoginScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _code = TextEditingController();
  _Step _step = _Step.login;
  bool _loading = false;
  bool _hidden = true;
  String? _error;
  RequestedOtp? _challenge;
  int _retrySeconds = 0;
  Timer? _timer;
  @override
  void dispose() {
    _timer?.cancel();
    _identifier.dispose();
    _password.dispose();
    _confirm.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _finish(AuthSession session) async {
    if (session.subjectType != 'driver')
      throw const FormatException('Sessão de motorista inválida.');
    try {
      await widget.tokenStore.saveAccessToken(session.accessToken);
    } catch (_) {
      try {
        await widget.phoneService.logout(session.accessToken);
      } catch (_) {}
      rethrow;
    }
    _password.clear();
    _confirm.clear();
    _code.clear();
    if (mounted) widget.onAuthenticated(session.accessToken);
  }

  Future<void> _submit() async {
    if (_loading) return;
    if (_identifier.text.trim().isEmpty) {
      setState(() => _error = 'Informe seu usuário ou e-mail.');
      return;
    }
    if (_step == _Step.recovery) {
      await _requestRecovery();
      return;
    }
    if (_step == _Step.reset) {
      if (_code.text.length != 6) {
        setState(() => _error = 'Digite o código de 6 dígitos.');
        return;
      }
      if (_password.text.length < 10 ||
          !RegExp(r'[A-Za-zÀ-ÿ]').hasMatch(_password.text) ||
          !RegExp(r'\d').hasMatch(_password.text)) {
        setState(
          () => _error =
              'Use pelo menos 10 caracteres, incluindo letra e número.',
        );
        return;
      }
      if (_password.text != _confirm.text) {
        setState(() => _error = 'As senhas não são iguais.');
        return;
      }
    } else if (_password.text.isEmpty) {
      setState(() => _error = 'Informe sua senha.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = _step == _Step.reset
          ? await widget.passwordService.completePasswordReset(
              challengeId: _challenge!.challengeId,
              code: _code.text,
              password: _password.text,
            )
          : await widget.passwordService.loginWithPassword(
              identifier: _identifier.text.trim(),
              password: _password.text,
            );
      await _finish(session);
    } catch (error) {
      if (mounted)
        setState(() {
          _loading = false;
          _error = error.toString();
        });
    }
  }

  Future<void> _requestRecovery() async {
    if (_loading || _retrySeconds > 0) return;
    if (_identifier.text.trim().isEmpty) {
      setState(() => _error = 'Informe seu usuário ou e-mail.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await widget.passwordService.requestPasswordReset(
        identifier: _identifier.text.trim(),
      );
      if (!mounted) return;
      _password.clear();
      _confirm.clear();
      _code.clear();
      setState(() {
        _challenge = value;
        _step = _Step.reset;
        _retrySeconds = value.retryAfterSeconds;
        _loading = false;
      });
      _timer?.cancel();
      if (_retrySeconds > 0)
        _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
          if (!mounted || _retrySeconds <= 1) {
            timer.cancel();
            if (mounted) setState(() => _retrySeconds = 0);
            return;
          }
          setState(() => _retrySeconds--);
        });
    } catch (error) {
      if (mounted)
        setState(() {
          _loading = false;
          _error = error.toString();
        });
    }
  }

  void _backToLogin() {
    _timer?.cancel();
    _password.clear();
    _confirm.clear();
    _code.clear();
    setState(() {
      _step = _Step.login;
      _challenge = null;
      _error = null;
      _retrySeconds = 0;
    });
  }

  Future<void> _firstAccess() async {
    if (_loading) return;
    final pendingStore = _PendingTokenStore();
    final token = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (context) => PhoneLoginScreen(
          service: widget.phoneService,
          tokenStore: pendingStore,
          title: 'Crie seu acesso',
          subtitle:
              'Confirme seu WhatsApp para criar usuário e senha na sua conta.',
          requestRegistrationOtp:
              widget.phoneService is DriverRegistrationAuthService
              ? (phone) =>
                    (widget.phoneService as DriverRegistrationAuthService)
                        .requestRegistrationOtp(phone: phone)
              : null,
          onAuthenticated: (token) => Navigator.of(context).pop(token),
        ),
      ),
    );
    if (token == null || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final configured = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (context) => DriverPasswordSetupScreen(
            service: widget.passwordService,
            accessToken: token,
            onConfigured: () => Navigator.of(context).pop(true),
          ),
        ),
      );
      if (configured != true) {
        await widget.phoneService.logout(token);
        if (mounted) setState(() => _loading = false);
        return;
      }
      final info = await widget.phoneService.currentSession(token);
      if (info == null || info.subjectType != 'driver')
        throw const FormatException(
          'Sua sessão expirou. Entre com usuário e senha.',
        );
      await _finish(
        AuthSession(
          accessToken: token,
          expiresAt: info.expiresAt,
          subjectId: info.subjectId,
          subjectType: info.subjectType,
        ),
      );
    } catch (error) {
      try {
        await widget.phoneService.logout(token);
      } catch (_) {}
      if (mounted)
        setState(() {
          _loading = false;
          _error = error.toString();
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final recovering = _step != _Step.login;
    return RamoAuthScaffold(
      heroImageUrl: DriverCoreConfig.baseUri
          ?.resolve('/v1/content/app-auth-branding/hero')
          .toString(),
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: RamoBrandLockup(),
            ),
            const SizedBox(height: 40),
            Text(
              _step == _Step.login
                  ? 'Entre na sua conta'
                  : _step == _Step.recovery
                  ? 'Recupere sua senha'
                  : 'Crie uma nova senha',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: -1.3,
                height: 1.04,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _step == _Step.login
                  ? 'Use seu usuário ou e-mail e senha para dirigir com o Ramo Nessa.'
                  : _step == _Step.recovery
                  ? 'Informe seu usuário ou e-mail. Se houver uma conta elegível, enviaremos um código ao WhatsApp cadastrado.'
                  : 'Digite o código recebido no WhatsApp e escolha sua nova senha.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 28),
            if (_step != _Step.reset) ...[
              TextField(
                key: const Key('driver-login-identifier'),
                controller: _identifier,
                enabled: !_loading,
                autocorrect: false,
                enableSuggestions: false,
                autofillHints: const [AutofillHints.username],
                keyboardType: TextInputType.emailAddress,
                textInputAction: _step == _Step.login
                    ? TextInputAction.next
                    : TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Usuário ou e-mail',
                ),
                onSubmitted: recovering ? (_) => _submit() : null,
              ),
              const SizedBox(height: 16),
            ],
            if (_step == _Step.reset) ...[
              TextField(
                key: const Key('driver-reset-code'),
                controller: _code,
                enabled: !_loading,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: const InputDecoration(
                  labelText: 'Código do WhatsApp',
                ),
              ),
              const SizedBox(height: 16),
            ],
            if (_step != _Step.recovery) ...[
              TextField(
                key: const Key('driver-login-password'),
                controller: _password,
                enabled: !_loading,
                obscureText: _hidden,
                autofillHints: [
                  _step == _Step.reset
                      ? AutofillHints.newPassword
                      : AutofillHints.password,
                ],
                textInputAction: _step == _Step.reset
                    ? TextInputAction.next
                    : TextInputAction.done,
                decoration: InputDecoration(
                  labelText: _step == _Step.reset ? 'Nova senha' : 'Senha',
                  helperText: _step == _Step.reset
                      ? 'Pelo menos 10 caracteres, com letra e número.'
                      : null,
                  suffixIcon: IconButton(
                    tooltip: _hidden ? 'Mostrar senha' : 'Ocultar senha',
                    onPressed: () => setState(() => _hidden = !_hidden),
                    icon: Icon(
                      _hidden
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                onSubmitted: _step == _Step.login ? (_) => _submit() : null,
              ),
              if (_step == _Step.reset) ...[
                const SizedBox(height: 16),
                TextField(
                  key: const Key('driver-reset-confirm'),
                  controller: _confirm,
                  enabled: !_loading,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirmar nova senha',
                  ),
                  onSubmitted: (_) => _submit(),
                ),
              ],
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                key: const Key('driver-login-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('driver-login-submit'),
              onPressed: _loading ? null : _submit,
              child: Text(
                _loading
                    ? 'Aguarde…'
                    : _step == _Step.login
                    ? 'Entrar'
                    : _step == _Step.recovery
                    ? 'Receber código no WhatsApp'
                    : 'Salvar senha e entrar',
              ),
            ),
            if (_step == _Step.login) ...[
              TextButton(
                key: const Key('driver-forgot-password'),
                onPressed: _loading
                    ? null
                    : () {
                        _password.clear();
                        setState(() {
                          _step = _Step.recovery;
                          _error = null;
                        });
                      },
                child: const Text('Esqueci minha senha'),
              ),
              TextButton(
                key: const Key('driver-first-access'),
                onPressed: _loading ? null : _firstAccess,
                child: const Text('Primeiro acesso ou cadastrar motorista'),
              ),
            ] else ...[
              if (_step == _Step.reset)
                TextButton(
                  key: const Key('driver-reset-resend'),
                  onPressed: _loading || _retrySeconds > 0
                      ? null
                      : _requestRecovery,
                  child: Text(
                    _retrySeconds > 0
                        ? 'Reenviar em ${_retrySeconds}s'
                        : 'Reenviar código',
                  ),
                ),
              TextButton(
                onPressed: _loading ? null : _backToLogin,
                child: const Text('Voltar para entrar'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PendingTokenStore implements AuthTokenStore {
  String? _token;
  @override
  Future<String?> readAccessToken() async => _token;
  @override
  Future<void> saveAccessToken(String accessToken) async {
    _token = accessToken;
  }

  @override
  Future<void> clearAccessToken() async {
    _token = null;
  }
}
