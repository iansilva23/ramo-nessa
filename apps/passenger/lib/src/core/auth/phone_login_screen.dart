import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth_token_store.dart';
import 'phone_auth_service.dart';

class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({
    super.key,
    required this.service,
    required this.tokenStore,
    required this.title,
    required this.subtitle,
    required this.onAuthenticated,
  });

  final PhoneAuthService service;
  final AuthTokenStore tokenStore;
  final String title;
  final String subtitle;
  final ValueChanged<String> onAuthenticated;

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();

  RequestedOtp? _challenge;
  bool _loading = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (_loading) return;
    final email = _emailController.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+
      _loading = true;
      _error = null;
      _message = null;
    });

    try {
      final requested = await widget.service.requestOtp(
        phone: _phoneController.text,
        email: email,
      );
      if (!mounted) return;
      setState(() {
        _challenge = requested;
        _loading = false;
        _message = requested.devCode == null
            ? 'Código enviado por SMS.'
            : 'Código de desenvolvimento: ${requested.devCode}';
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

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    widget.title,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    widget.subtitle,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    key: const Key('auth-phone-field'),
                    controller: _phoneController,
                    enabled: !_loading && !waitingForCode,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Celular com DDD',
                      hintText: '(88) 99999-9999',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const Key('auth-email-field'),
                    controller: _emailController,
                    enabled: !_loading && !waitingForCode,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: 'E-mail',
                      hintText: 'voce@exemplo.com',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) {
                      if (!waitingForCode) _requestCode();
                    },
                  ),
                  if (waitingForCode) ...[
                    const SizedBox(height: 16),
                    TextField(
                      key: const Key('auth-code-field'),
                      controller: _codeController,
                      enabled: !_loading,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Código de 6 dígitos',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _verifyCode(),
                    ),
                  ],
                  if (_message != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _message!,
                      key: const Key('auth-message'),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _error!,
                      key: const Key('auth-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    key: const Key('auth-primary-button'),
                    onPressed: _loading
                        ? null
                        : waitingForCode
                            ? _verifyCode
                            : _requestCode,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: _loading
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              waitingForCode
                                  ? 'Confirmar código'
                                  : 'Receber código',
                            ),
                    ),
                  ),
                  if (waitingForCode) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () {
                              setState(() {
                                _challenge = null;
                                _codeController.clear();
                                _message = null;
                                _error = null;
                              });
                            },
                      child: const Text('Alterar dados'),
                    ),
                    TextButton(
                      onPressed: _loading ? null : _requestCode,
                      child: const Text('Reenviar código'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
).hasMatch(email)) {
      setState(() => _error = 'Digite um e-mail válido.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });

    try {
      final requested =
          await widget.service.requestOtp(_phoneController.text);
      if (!mounted) return;
      setState(() {
        _challenge = requested;
        _loading = false;
        _message = requested.devCode == null
            ? 'Código enviado por SMS.'
            : 'Código de desenvolvimento: ${requested.devCode}';
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

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    widget.title,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    widget.subtitle,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    key: const Key('auth-phone-field'),
                    controller: _phoneController,
                    enabled: !_loading && !waitingForCode,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Celular com DDD',
                      hintText: '(88) 99999-9999',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) {
                      if (!waitingForCode) _requestCode();
                    },
                  ),
                  if (waitingForCode) ...[
                    const SizedBox(height: 16),
                    TextField(
                      key: const Key('auth-code-field'),
                      controller: _codeController,
                      enabled: !_loading,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Código de 6 dígitos',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _verifyCode(),
                    ),
                  ],
                  if (_message != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _message!,
                      key: const Key('auth-message'),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _error!,
                      key: const Key('auth-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    key: const Key('auth-primary-button'),
                    onPressed: _loading
                        ? null
                        : waitingForCode
                            ? _verifyCode
                            : _requestCode,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: _loading
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              waitingForCode
                                  ? 'Confirmar código'
                                  : 'Receber código',
                            ),
                    ),
                  ),
                  if (waitingForCode) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () {
                              setState(() {
                                _challenge = null;
                                _codeController.clear();
                                _message = null;
                                _error = null;
                              });
                            },
                      child: const Text('Trocar número'),
                    ),
                    TextButton(
                      onPressed: _loading ? null : _requestCode,
                      child: const Text('Reenviar código'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
