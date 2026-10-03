import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'auth_token_store.dart';
import 'phone_auth_service.dart';
import '../config/driver_core_config.dart';

class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({
    super.key,
    required this.service,
    required this.tokenStore,
    required this.title,
    required this.subtitle,
    required this.onAuthenticated,
    this.requestRegistrationOtp,
  });

  final PhoneAuthService service;
  final AuthTokenStore tokenStore;
  final String title;
  final String subtitle;
  final ValueChanged<String> onAuthenticated;
  final Future<RequestedOtp> Function(String phone)? requestRegistrationOtp;

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();

  RequestedOtp? _challenge;
  bool _loading = false;
  String? _message;
  String? _error;
  bool _registering = false;
  Timer? _cooldownTimer;
  int _retrySeconds = 0;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (_loading || _retrySeconds > 0) return;

    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });

    try {
      final requested = _registering && widget.requestRegistrationOtp != null
          ? await widget.requestRegistrationOtp!(_phoneController.text)
          : await widget.service.requestOtp(phone: _phoneController.text);
      if (!mounted) return;
      setState(() {
        _challenge = requested;
        _retrySeconds = requested.retryAfterSeconds;
        _loading = false;
        _message = requested.devCode == null
            ? (_registering
                ? 'Se este número estiver disponível para cadastro, o código chegará pelo WhatsApp.'
                : 'Se este número tiver acesso, o código chegará pelo WhatsApp. Se ainda não tem cadastro, escolha Cadastrar como motorista.')
            : 'Código de desenvolvimento: ${requested.devCode}';
      });
      _cooldownTimer?.cancel();
      _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted || _retrySeconds <= 1) { timer.cancel(); if (mounted) setState(() => _retrySeconds = 0); return; }
        setState(() => _retrySeconds--);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _verifyCode() async {
    final challenge = _challenge;
    if (_loading || challenge == null) return;

    final code = _codeController.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Digite o código de 6 dígitos.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await widget.service.verifyOtp(
        challengeId: challenge.challengeId,
        code: code,
      );

      try {
        await widget.tokenStore.saveAccessToken(session.accessToken);
      } catch (_) {
        try {
          await widget.service.logout(session.accessToken);
        } catch (_) {}
        rethrow;
      }

      _cooldownTimer?.cancel();
      if (!mounted) return;
      widget.onAuthenticated(session.accessToken);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final waitingForCode = _challenge != null;

    return RamoAuthScaffold(
      heroImageUrl: DriverCoreConfig.baseUri
          ?.resolve('/v1/content/app-auth-branding/hero')
          .toString(),
      child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: RamoBrandLockup(),
                  ),
                  const SizedBox(height: 54),
                  Text(
                    waitingForCode ? 'Confirme seu número' : _registering ? 'Seja motorista Ramo Nessa' : widget.title,
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1.3,
                          height: 1.04,
                        ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    waitingForCode
                        ? 'Digite o código de 6 dígitos recebido pelo WhatsApp.'
                        : _registering ? 'Valide seu WhatsApp, cadastre seu veículo e envie os documentos. Você acompanha a análise por aqui.' : widget.subtitle,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          height: 1.4,
                        ),
                  ),
                  const SizedBox(height: 32),
                  if (!waitingForCode)
                    TextField(
                      key: const Key('auth-phone-field'),
                      controller: _phoneController,
                      enabled: !_loading,
                      autofocus: true,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Celular',
                        hintText: '(88) 99999-9999',
                        prefixText: '+55  ',
                        prefixStyle: TextStyle(
                          color: RamoColors.brandBlack,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      onSubmitted: (_) => _requestCode(),
                    )
                  else
                    TextField(
                      key: const Key('auth-code-field'),
                      controller: _codeController,
                      enabled: !_loading,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 6,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Código',
                        hintText: '000000',
                      ),
                      onSubmitted: (_) => _verifyCode(),
                    ),
                  if (_message != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _message!,
                      key: const Key('auth-message'),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(RamoSpacing.md),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(RamoRadius.md),
                      ),
                      child: Text(
                        _error!,
                        key: const Key('auth-error'),
                        style: TextStyle(
                          color:
                              Theme.of(context).colorScheme.onErrorContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  RamoRouteSubmitButton(
                    key: const Key('auth-primary-button'),
                    onPressed: waitingForCode ? _verifyCode : _requestCode,
                    loading: _loading,
                    label: waitingForCode ? 'Confirmar e continuar' : _registering ? 'Validar WhatsApp' : 'Continuar',
                  ),
                  if (waitingForCode) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () {
                              setState(() {
                                _challenge = null;
                                _cooldownTimer?.cancel();
                                _retrySeconds = 0;
                                _codeController.clear();
                                _message = null;
                                _error = null;
                              });
                            },
                      child: const Text('Alterar número'),
                    ),
                    TextButton(
                      onPressed: _loading || _retrySeconds > 0 ? null : _requestCode,
                      child: Text(_retrySeconds > 0 ? 'Reenviar em ${_retrySeconds}s' : 'Reenviar código'),
                    ),
                  ] else ...[
                    if (widget.requestRegistrationOtp != null) ...[
                      const SizedBox(height: 12),
                      TextButton(
                        key: const Key('driver-registration-button'),
                        onPressed: _loading ? null : () => setState(() {
                          _registering = !_registering; _error = null; _message = null;
                        }),
                        child: Text(_registering ? 'Já tenho cadastro. Entrar' : 'Cadastrar como motorista'),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Text(
                      'Ao continuar, você concorda em receber um código de verificação pelo WhatsApp neste número.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ],
              ),
    );
  }
}
