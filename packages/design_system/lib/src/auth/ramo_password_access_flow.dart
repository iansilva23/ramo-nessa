import 'package:flutter/material.dart';

import '../brand/ramo_brand_lockup.dart';
import 'ramo_auth_experience.dart';

class RamoPasswordAccessValues {
  const RamoPasswordAccessValues({
    required this.identifier,
    required this.password,
    required this.fullName,
    required this.phone,
    required this.email,
    required this.username,
  });
  final String identifier, password, fullName, phone, email, username;
}

/// One presentation and navigation flow for both account roles.
class RamoPasswordAccessFlow extends StatefulWidget {
  const RamoPasswordAccessFlow({
    super.key,
    required this.driver,
    required this.onLogin,
    required this.onRegister,
    this.heroImageUrl,
  });
  final bool driver;
  final String? heroImageUrl;
  final Future<void> Function(RamoPasswordAccessValues values) onLogin,
      onRegister;
  @override
  State<RamoPasswordAccessFlow> createState() => _RamoPasswordAccessFlowState();
}

enum _AccessPage { landing, login, register }

class _RamoPasswordAccessFlowState extends State<RamoPasswordAccessFlow> {
  final _identifier = TextEditingController(),
      _password = TextEditingController();
  final _name = TextEditingController(),
      _phone = TextEditingController(),
      _email = TextEditingController(),
      _username = TextEditingController();
  _AccessPage _page = _AccessPage.landing;
  bool _loading = false;
  String? _error;
  @override
  void dispose() {
    for (final c in [
      _identifier,
      _password,
      _name,
      _phone,
      _email,
      _username,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _go(_AccessPage page) {
    if (_loading) {
      return;
    }
    setState(() {
      _page = page;
      _error = null;
      _password.clear();
    });
  }

  Future<void> _submit() async {
    if (_loading) {
      return;
    }
    final registering = _page == _AccessPage.register;
    if ((!registering && _identifier.text.trim().isEmpty) ||
        _password.text.isEmpty) {
      setState(() => _error = 'Preencha seu acesso e sua senha.');
      return;
    }
    if (registering &&
        (_name.text.trim().length < 3 ||
            _phone.text.replaceAll(RegExp(r'\D'), '').length < 10 ||
            !_email.text.contains('@') ||
            (widget.driver &&
                !RegExp(r'^[a-zA-Z][a-zA-Z0-9._-]{2,31}$')
                    .hasMatch(_username.text.trim())) ||
            _password.text.length < 10 ||
            !RegExp(r'[A-Za-zÀ-ÿ]').hasMatch(_password.text) ||
            !RegExp(r'\d').hasMatch(_password.text))) {
      setState(
        () => _error = 'Confira os dados e use uma senha com pelo menos 10 caracteres, incluindo letra e número.',
      );
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final values = RamoPasswordAccessValues(
        identifier: _identifier.text.trim(),
        password: _password.text,
        fullName: _name.text.trim(),
        phone: _phone.text,
        email: _email.text.trim(),
        username: _username.text.trim(),
      );
      await (registering ? widget.onRegister(values) : widget.onLogin(values));
      if (!mounted) {
        return;
      }
      _password.clear();
      if (mounted) {
        setState(() => _loading = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  Widget _heading(String title, String subtitle) => Column(
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
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          height: 1.4,
        ),
      ),
    ],
  );
  Widget _field(
    String keyName,
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
    bool secret = false,
    String? helper,
    Iterable<String>? hints,
  }) => TextField(
    key: Key(keyName),
    controller: controller,
    enabled: !_loading,
    keyboardType: keyboard,
    obscureText: secret,
    autofillHints: hints,
    textInputAction: secret ? TextInputAction.done : TextInputAction.next,
    textCapitalization: keyName == 'auth-name-field'
        ? TextCapitalization.words
        : TextCapitalization.none,
    decoration: InputDecoration(labelText: label, helperText: helper),
    onSubmitted: secret ? (_) => _submit() : null,
  );
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _page == _AccessPage.landing && !_loading,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop && !_loading) {
        _go(_AccessPage.landing);
      }
    },
    child: RamoAuthScaffold(
      heroImageUrl: widget.heroImageUrl,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (_page != _AccessPage.landing)
                  IconButton(
                    key: const Key('auth-back-button'),
                    onPressed: _loading ? null : () => _go(_AccessPage.landing),
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
            if (_page == _AccessPage.landing) ...[
              _heading(
                widget.driver
                    ? 'Seu próximo caminho começa aqui.'
                    : 'Seu caminho começa aqui.',
                widget.driver
                    ? 'Dirija com o Ramo Nessa e conecte-se a novas oportunidades na sua região.'
                    : 'Entre na sua conta ou crie uma para pedir corridas e acompanhar tudo com segurança.',
              ),
              const SizedBox(height: 34),
              FilledButton(
                key: const Key('auth-login-button'),
                onPressed: () => _go(_AccessPage.login),
                child: const Text('Entrar'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                key: const Key('auth-create-account-button'),
                onPressed: () => _go(_AccessPage.register),
                child: Text(
                  widget.driver ? 'Seja um motorista parceiro' : 'Criar conta',
                ),
              ),
            ] else if (_page == _AccessPage.login) ...[
              _heading(
                'Entrar',
                widget.driver
                    ? 'Use seu usuário ou e-mail e sua senha.'
                    : 'Use seu e-mail e sua senha.',
              ),
              const SizedBox(height: 28),
              _field(
                'auth-email-field',
                _identifier,
                widget.driver ? 'Usuário ou e-mail' : 'E-mail',
                keyboard: widget.driver
                    ? TextInputType.text
                    : TextInputType.emailAddress,
                hints: [
                  widget.driver ? AutofillHints.username : AutofillHints.email,
                ],
              ),
              const SizedBox(height: 14),
              _field(
                'auth-password-field',
                _password,
                'Senha',
                secret: true,
                hints: const [AutofillHints.password],
              ),
              const SizedBox(height: 22),
              RamoRouteSubmitButton(
                key: const Key('auth-primary-button'),
                onPressed: _submit,
                loading: _loading,
                label: 'Entrar',
              ),
            ] else ...[
              _heading(
                widget.driver
                    ? 'Comece sua jornada como parceiro'
                    : 'Criar conta',
                widget.driver
                    ? 'Crie seu acesso para continuar com seu cadastro de motorista.'
                    : 'Seus dados ficam associados à sua conta do Ramo Nessa.',
              ),
              const SizedBox(height: 26),
              _field(
                'auth-name-field',
                _name,
                'Nome completo',
                hints: const [AutofillHints.name],
              ),
              const SizedBox(height: 12),
              if (widget.driver) ...[
                _field(
                  'auth-username-field',
                  _username,
                  'Usuário',
                  helper: 'De 3 a 32 caracteres, começando com letra.',
                  hints: const [AutofillHints.newUsername],
                ),
                const SizedBox(height: 12),
              ],
              _field(
                'auth-phone-field',
                _phone,
                'WhatsApp para contato',
                keyboard: TextInputType.phone,
                helper: 'Informe o número com DDD.',
              ),
              const SizedBox(height: 12),
              _field(
                'auth-email-field',
                _email,
                'E-mail',
                keyboard: TextInputType.emailAddress,
                hints: const [AutofillHints.email],
              ),
              const SizedBox(height: 12),
              _field(
                'auth-password-field',
                _password,
                'Senha',
                secret: true,
                helper: 'Mínimo de 10 caracteres, com letra e número.',
                hints: const [AutofillHints.newPassword],
              ),
              const SizedBox(height: 22),
              RamoRouteSubmitButton(
                key: const Key('auth-primary-button'),
                onPressed: _submit,
                loading: _loading,
                label: widget.driver ? 'Continuar cadastro' : 'Criar conta',
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
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
        ),
      ),
    ),
  );
}
