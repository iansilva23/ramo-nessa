import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'auth_token_store.dart';
import 'phone_auth_service.dart';

enum _PassengerAuthMode {
  landing,
  login,
  register,
  registerOtp,
  recoveryPhone,
  recoveryOtp,
  recoveryPassword,
}

class PassengerAuthScreen extends StatefulWidget {
  const PassengerAuthScreen({
    super.key,
    required this.service,
    required this.tokenStore,
    required this.onAuthenticated,
  });

  final PhoneAuthService service;
  final AuthTokenStore tokenStore;
  final ValueChanged<String> onAuthenticated;

  @override
  State<PassengerAuthScreen> createState() => _PassengerAuthScreenState();
}

class _PassengerAuthScreenState extends State<PassengerAuthScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _codeController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  _PassengerAuthMode _mode = _PassengerAuthMode.landing;
  RequestedOtp? _challenge;
  AuthSession? _recoverySession;
  bool _loading = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _codeController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _go(_PassengerAuthMode mode) {
    setState(() {
      _mode = mode;
      _error = null;
      _message = null;
      if (mode != _PassengerAuthMode.registerOtp &&
          mode != _PassengerAuthMode.recoveryOtp) {
        _challenge = null;
        _codeController.clear();
      }
    });
  }

  Future<void> _saveSession(AuthSession session) async {
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
  }

  Future<void> _login() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = await widget.service.loginWithPassword(
        email: _emailController.text,
        password: _passwordController.text,
      );
      await _saveSession(session);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _startRegistration() async {
    if (_loading) return;
    if (_nameController.text.trim().length < 3 ||
        _phoneController.text.trim().length < 8 ||
        !_emailController.text.contains('@') ||
        _passwordController.text.length < 10) {
      setState(() {
        _error =
            'Preencha nome, celular, e-mail e uma senha com pelo menos 10 caracteres.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });

    try {
      final challenge = await widget.service.requestOtp(
        phone: _phoneController.text,
        email: _emailController.text,
      );
      if (!mounted) return;
      setState(() {
        _challenge = challenge;
        _loading = false;
        _mode = _PassengerAuthMode.registerOtp;
        _message = challenge.devCode == null
            ? 'Código enviado por SMS.'
            : 'Código de desenvolvimento: ${challenge.devCode}';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _finishRegistration() async {
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

    AuthSession? session;
    try {
      session = await widget.service.verifyOtp(
        challengeId: challenge.challengeId,
        code: code,
      );
      await widget.service.updatePassengerAccount(
        accessToken: session.accessToken,
        fullName: _nameController.text,
        email: _emailController.text,
        password: _passwordController.text,
      );
      await _saveSession(session);
    } catch (error) {
      if (session != null) {
        try {
          await widget.service.logout(session.accessToken);
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _startRecovery() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });
    try {
      final challenge = await widget.service.requestPasswordResetOtp(
        phone: _phoneController.text,
      );
      if (!mounted) return;
      setState(() {
        _challenge = challenge;
        _loading = false;
        _mode = _PassengerAuthMode.recoveryOtp;
        _message = challenge.devCode == null
            ? 'Se o número estiver vinculado à sua conta, enviaremos um código por SMS.'
            : 'Código de desenvolvimento: ${challenge.devCode}';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _verifyRecoveryOtp() async {
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
      if (!mounted) return;
      setState(() {
        _recoverySession = session;
        _loading = false;
        _mode = _PassengerAuthMode.recoveryPassword;
        _codeController.clear();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _finishRecovery() async {
    final session = _recoverySession;
    if (_loading || session == null) return;
    if (_newPasswordController.text != _confirmPasswordController.text) {
      setState(() => _error = 'As senhas não são iguais.');
      return;
    }
    if (_newPasswordController.text.length < 10) {
      setState(
        () => _error = 'A nova senha precisa ter pelo menos 10 caracteres.',
      );
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.service.updatePassengerAccount(
        accessToken: session.accessToken,
        password: _newPasswordController.text,
      );
      await _saveSession(session);
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
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 36),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: _buildContent(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (_mode != _PassengerAuthMode.landing)
              IconButton(
                key: const Key('auth-back-button'),
                onPressed: _loading
                    ? null
                    : () {
                        if (_mode == _PassengerAuthMode.registerOtp) {
                          _go(_PassengerAuthMode.register);
                        } else if (_mode ==
                            _PassengerAuthMode.recoveryOtp) {
                          _go(_PassengerAuthMode.recoveryPhone);
                        } else if (_mode ==
                            _PassengerAuthMode.recoveryPassword) {
                          _go(_PassengerAuthMode.recoveryPhone);
                        } else {
                          _go(_PassengerAuthMode.landing);
                        }
                      },
                icon: const Icon(Icons.arrow_back_rounded),
              ),
            const Spacer(),
          ],
        ),
        const Align(
          alignment: Alignment.centerLeft,
          child: RamoBrandLockup(),
        ),
        const SizedBox(height: 44),
        if (_mode == _PassengerAuthMode.landing)
          _landing(context)
        else if (_mode == _PassengerAuthMode.login)
          _loginForm(context)
        else if (_mode == _PassengerAuthMode.register)
          _registerForm(context)
        else if (_mode == _PassengerAuthMode.registerOtp)
          _otpForm(
            context,
            title: 'Confirme seu celular',
            subtitle:
                'Digite o código enviado por SMS para concluir sua conta.',
            onSubmit: _finishRegistration,
          )
        else if (_mode == _PassengerAuthMode.recoveryPhone)
          _recoveryPhoneForm(context)
        else if (_mode == _PassengerAuthMode.recoveryOtp)
          _otpForm(
            context,
            title: 'Confirme sua conta',
            subtitle: 'Digite o código recebido por SMS.',
            onSubmit: _verifyRecoveryOtp,
          )
        else
          _newPasswordForm(context),
        if (_message != null) ...[
          const SizedBox(height: 14),
          Text(
            _message!,
            key: const Key('auth-message'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: RamoColors.muted,
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
                color: Theme.of(context).colorScheme.onErrorContainer,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _landing(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Seu caminho começa aqui.',
          style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: -1.4,
                height: 1.02,
              ),
        ),
        const SizedBox(height: 12),
        Text(
          'Entre na sua conta ou crie uma para pedir corridas e acompanhar tudo com segurança.',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: RamoColors.muted,
                height: 1.4,
              ),
        ),
        const SizedBox(height: 34),
        FilledButton(
          key: const Key('auth-login-button'),
          onPressed: () => _go(_PassengerAuthMode.login),
          child: const Text('Entrar'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          key: const Key('auth-create-account-button'),
          onPressed: () => _go(_PassengerAuthMode.register),
          child: const Text('Criar conta'),
        ),
      ],
    );
  }

  Widget _loginForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _heading(context, 'Entrar', 'Use seu e-mail e sua senha.'),
        const SizedBox(height: 28),
        TextField(
          key: const Key('auth-email-field'),
          controller: _emailController,
          enabled: !_loading,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'E-mail'),
        ),
        const SizedBox(height: 14),
        TextField(
          key: const Key('auth-password-field'),
          controller: _passwordController,
          enabled: !_loading,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(labelText: 'Senha'),
          onSubmitted: (_) => _login(),
        ),
        const SizedBox(height: 22),
        FilledButton(
          key: const Key('auth-primary-button'),
          onPressed: _loading ? null : _login,
          child: _buttonChild('Entrar'),
        ),
        const SizedBox(height: 8),
        TextButton(
          key: const Key('auth-forgot-password-button'),
          onPressed:
              _loading ? null : () => _go(_PassengerAuthMode.recoveryPhone),
          child: const Text('Esqueci minha senha'),
        ),
      ],
    );
  }

  Widget _registerForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _heading(
          context,
          'Criar conta',
          'Seus dados ficam associados à sua conta do Ramo Nessa.',
        ),
        const SizedBox(height: 26),
        TextField(
          key: const Key('auth-name-field'),
          controller: _nameController,
          enabled: !_loading,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.name],
          decoration: const InputDecoration(labelText: 'Nome completo'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('auth-phone-field'),
          controller: _phoneController,
          enabled: !_loading,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Celular',
            hintText: '(88) 99999-9999',
            prefixText: '+55  ',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('auth-email-field'),
          controller: _emailController,
          enabled: !_loading,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(labelText: 'E-mail'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('auth-password-field'),
          controller: _passwordController,
          enabled: !_loading,
          obscureText: true,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.newPassword],
          decoration: const InputDecoration(
            labelText: 'Senha',
            helperText: 'Mínimo de 10 caracteres, com letra e número.',
          ),
          onSubmitted: (_) => _startRegistration(),
        ),
        const SizedBox(height: 22),
        FilledButton(
          key: const Key('auth-primary-button'),
          onPressed: _loading ? null : _startRegistration,
          child: _buttonChild('Continuar'),
        ),
      ],
    );
  }

  Widget _recoveryPhoneForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _heading(
          context,
          'Recuperar senha',
          'Confirme o celular já vinculado à sua conta.',
        ),
        const SizedBox(height: 28),
        TextField(
          key: const Key('auth-phone-field'),
          controller: _phoneController,
          enabled: !_loading,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'Celular da conta',
            hintText: '(88) 99999-9999',
            prefixText: '+55  ',
          ),
          onSubmitted: (_) => _startRecovery(),
        ),
        const SizedBox(height: 22),
        FilledButton(
          key: const Key('auth-primary-button'),
          onPressed: _loading ? null : _startRecovery,
          child: _buttonChild('Enviar código'),
        ),
      ],
    );
  }

  Widget _otpForm(
    BuildContext context, {
    required String title,
    required String subtitle,
    required Future<void> Function() onSubmit,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _heading(context, title, subtitle),
        const SizedBox(height: 28),
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
          onSubmitted: (_) => onSubmit(),
        ),
        const SizedBox(height: 22),
        FilledButton(
          key: const Key('auth-primary-button'),
          onPressed: _loading ? null : onSubmit,
          child: _buttonChild('Confirmar'),
        ),
      ],
    );
  }

  Widget _newPasswordForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _heading(context, 'Nova senha', 'Crie uma nova senha para sua conta.'),
        const SizedBox(height: 28),
        TextField(
          key: const Key('auth-new-password-field'),
          controller: _newPasswordController,
          enabled: !_loading,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Nova senha'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('auth-confirm-password-field'),
          controller: _confirmPasswordController,
          enabled: !_loading,
          obscureText: true,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(labelText: 'Confirmar senha'),
          onSubmitted: (_) => _finishRecovery(),
        ),
        const SizedBox(height: 22),
        FilledButton(
          key: const Key('auth-primary-button'),
          onPressed: _loading ? null : _finishRecovery,
          child: _buttonChild('Salvar nova senha'),
        ),
      ],
    );
  }

  Widget _heading(BuildContext context, String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: -1.3,
                height: 1.04,
              ),
        ),
        const SizedBox(height: 10),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: RamoColors.muted,
                height: 1.4,
              ),
        ),
      ],
    );
  }

  Widget _buttonChild(String label) {
    return _loading
        ? const SizedBox.square(
            dimension: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Colors.white,
            ),
          )
        : Text(label);
  }
}
