import 'package:flutter/material.dart';

import 'driver_password_auth_service.dart';

class DriverPasswordSetupScreen extends StatefulWidget {
  const DriverPasswordSetupScreen({
    super.key,
    required this.service,
    required this.accessToken,
    this.onConfigured,
  });
  final DriverPasswordAuthService service;
  final String accessToken;
  final VoidCallback? onConfigured;
  @override
  State<DriverPasswordSetupScreen> createState() =>
      _DriverPasswordSetupScreenState();
}

class _DriverPasswordSetupScreenState extends State<DriverPasswordSetupScreen> {
  final _username = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _configured = false;
  bool _hidden = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _username.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final credentials = await widget.service.loginCredentials(
        widget.accessToken,
      );
      if (!mounted) return;
      setState(() {
        _configured = credentials.configured;
        _username.text = credentials.username ?? '';
        _email.text = credentials.email ?? '';
        _loading = false;
      });
    } catch (error) {
      if (mounted)
        setState(() {
          _error = error.toString();
          _loading = false;
        });
    }
  }

  Future<void> _save() async {
    if (_saving || _loading || _configured) return;
    final username = _username.text.trim().toLowerCase();
    if (!RegExp(r'^[a-z][a-z0-9._-]{2,31}$').hasMatch(username)) {
      setState(
        () => _error =
            'Crie um usuário de 3 a 32 caracteres, começando com letra.',
      );
      return;
    }
    if (!_email.text.trim().contains('@')) {
      setState(() => _error = 'Informe seu e-mail.');
      return;
    }
    if (_password.text.length < 10 ||
        !RegExp(r'[A-Za-zÀ-ÿ]').hasMatch(_password.text) ||
        !RegExp(r'\d').hasMatch(_password.text)) {
      setState(
        () =>
            _error = 'Use pelo menos 10 caracteres, incluindo letra e número.',
      );
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'As senhas não são iguais.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.service.createLoginCredentials(
        accessToken: widget.accessToken,
        username: username,
        email: _email.text.trim(),
        password: _password.text,
      );
      if (!mounted) return;
      _password.clear();
      _confirm.clear();
      setState(() {
        _configured = true;
        _saving = false;
      });
      if (widget.onConfigured != null) {
        widget.onConfigured!();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Usuário e senha cadastrados. Seu acesso está pronto.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted)
        setState(() {
          _saving = false;
          _error = error.toString();
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Usuário e senha')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(
                _configured ? 'Seu acesso está configurado' : 'Crie seu acesso',
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(
                _configured
                    ? 'Você pode entrar com seu usuário ou e-mail e a mesma senha. Se esquecer, use a recuperação pelo WhatsApp na tela de entrada.'
                    : 'Entre com usuário ou e-mail e senha. Seu WhatsApp continua vinculado à recuperação da conta.',
              ),
              const SizedBox(height: 24),
              TextField(
                key: const Key('driver-setup-username'),
                controller: _username,
                enabled: !_saving && !_configured,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(
                  labelText: 'Usuário',
                  helperText: '3 a 32 caracteres. Letras, números, ponto, hífen ou sublinhado.',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('driver-setup-email'),
                controller: _email,
                enabled: !_saving && !_configured,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(labelText: 'E-mail'),
              ),
              if (!_configured) ...[
                const SizedBox(height: 16),
                TextField(
                  key: const Key('driver-setup-password'),
                  controller: _password,
                  enabled: !_saving,
                  obscureText: _hidden,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: InputDecoration(
                    labelText: 'Senha',
                    helperText: 'Pelo menos 10 caracteres, com letra e número.',
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
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('driver-setup-confirm'),
                  controller: _confirm,
                  enabled: !_saving,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirmar senha',
                  ),
                  onSubmitted: (_) => _save(),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  key: const Key('driver-setup-error'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: 24),
              if (!_configured)
                FilledButton(
                  key: const Key('driver-setup-save'),
                  onPressed: _saving ? null : _save,
                  child: Text(_saving ? 'Salvando…' : 'Criar meu acesso'),
                ),
              if (_configured && widget.onConfigured != null)
                FilledButton(
                  onPressed: widget.onConfigured,
                  child: const Text('Continuar'),
                ),
              if (_error != null && !_configured)
                TextButton(
                  onPressed: _saving ? null : _load,
                  child: const Text('Atualizar configuração'),
                ),
            ],
          ),
  );
}
