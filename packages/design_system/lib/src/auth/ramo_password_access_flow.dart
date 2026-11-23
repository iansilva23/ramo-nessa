import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../brand/ramo_brand_lockup.dart';
import 'ramo_auth_experience.dart';
import 'ramo_social_access.dart';
import '../foundation/ramo_colors.dart';

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
    this.onRecoverPassword,
    this.socialAccess,
    this.onSocialAuthenticated,
  });
  final bool driver;
  final String? heroImageUrl;
  final VoidCallback? onRecoverPassword;
  final RamoSocialAccess? socialAccess;
  final Future<void> Function(Map<String, dynamic>)? onSocialAuthenticated;
  final Future<void> Function(RamoPasswordAccessValues values) onLogin,
      onRegister;
  @override
  State<RamoPasswordAccessFlow> createState() => _RamoPasswordAccessFlowState();
}

enum _AccessPage { landing, register, socialRegister, socialLink }

class _RamoPasswordAccessFlowState extends State<RamoPasswordAccessFlow> {
  bool get _entry => _page == _AccessPage.landing;

  final _identifier = TextEditingController(),
      _password = TextEditingController();
  final _name = TextEditingController(),
      _phone = TextEditingController(),
      _email = TextEditingController(),
      _username = TextEditingController();
  _AccessPage _page = _AccessPage.landing;
  bool _loading = false;
  bool _rememberPassword = false;
  RamoSocialAccess? _activeSocial;
  RamoSocialProvider? _provider;
  bool get _socialPage =>
      _page == _AccessPage.socialRegister || _page == _AccessPage.socialLink;
  bool _passwordVisible = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final social = widget.socialAccess;
    if (social == null || !social.hasPendingGoogleRedirect) return;
    _activeSocial = social;
    _provider = RamoSocialProvider.google;
    _runSocial(social.resumeGoogleRedirect);
  }

  @override
  void dispose() {
    _activeSocial?.clear();
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
      if (page == _AccessPage.landing && _socialPage) {
        _activeSocial?.clear();
        _activeSocial = null;
        _provider = null;
        _identifier.clear();
        _phone.clear();
        _name.clear();
      }
      _page = page;
      _passwordVisible = false;
      _error = null;
      _password.clear();
    });
  }

  void _setRememberPassword(bool? checked) {
    setState(() => _rememberPassword = checked ?? false);
  }

  Future<void> _submit() async {
    if (_loading) {
      return;
    }
    if (_socialPage) {
      final social = _activeSocial!;
      final linking = _page == _AccessPage.socialLink;
      if (linking
          ? _identifier.text.trim().isEmpty || _password.text.isEmpty
          : _name.text.trim().length < 3 ||
                _phone.text.replaceAll(RegExp(r'\D'), '').length < 10) {
        setState(
          () => _error = linking
              ? 'Preencha o acesso e a senha da sua conta.'
              : 'Confira o nome e informe o WhatsApp com DDD.',
        );
        return;
      }
      await _runSocial(
        () => linking
            ? social.link(_identifier.text.trim(), _password.text)
            : social.register(_name.text.trim(), _phone.text),
      );
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
      TextInput.finishAutofillContext(
        shouldSave: !registering && _rememberPassword,
      );
      if (!mounted) return;
      _password.clear();
      setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  Future<void> _runSocial(Future<RamoSocialResult?> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await action();
      if (!mounted || result == null) return;
      if (result.next == null) {
        await widget.onSocialAuthenticated!(result.data);
        return;
      }
      setState(() {
        if (result.next == 'link') {
          _identifier.text = result.email ?? '';
          _page = _AccessPage.socialLink;
        } else {
          _name.text = result.fullName ?? '';
          _page = _AccessPage.socialRegister;
        }
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is FormatException
              ? error.message
              : 'Não foi possível continuar. Tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startSocial(RamoSocialProvider provider) {
    final social = widget.socialAccess!;
    _activeSocial = social;
    _provider = provider;
    _runSocial(() => social.start(provider));
  }

  Widget _providerIcon(RamoSocialProvider provider) => SizedBox.square(
    dimension: 22,
    child: Image.asset(
      'assets/auth/${provider.name}_sign_in.png',
      package: 'ramo_design_system',
    ),
  );

  Widget _providerButton(RamoSocialProvider provider) {
    final label = Text(provider.label);
    return OutlinedButton.icon(
      onPressed: _loading ? null : () => _startSocial(provider),
      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 50)),
      icon: _providerIcon(provider),
      label: label,
    );
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
      if (subtitle.isNotEmpty) const SizedBox(height: 10),
      if (subtitle.isNotEmpty)
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
    obscureText: secret && !_passwordVisible,
    autofillHints: hints,
    textInputAction: secret ? TextInputAction.done : TextInputAction.next,
    textCapitalization: keyName == 'auth-name-field'
        ? TextCapitalization.words
        : TextCapitalization.none,
    decoration: InputDecoration(
      labelText: label,
      helperText: helper,
      suffixIcon: secret
          ? IconButton(
              tooltip: _passwordVisible ? 'Ocultar senha' : 'Mostrar senha',
              onPressed: _loading
                  ? null
                  : () => setState(() => _passwordVisible = !_passwordVisible),
              icon: Icon(
                _passwordVisible
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
            )
          : null,
    ),
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
      showHero: !_socialPage,
      compactHero: _entry,
      heroOverlay: _entry ? const RamoBrandLockup() : null,

      child: TweenAnimationBuilder<double>(
        key: ValueKey(_page),
        tween: Tween(begin: 0.0, end: 1.0),
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        builder: (context, progress, child) => Opacity(
          opacity: progress,
          child: Transform.translate(
            offset: Offset(0, 10 * (1 - progress)),
            child: child,
          ),
        ),
        child: AutofillGroup(
          onDisposeAction: AutofillContextAction.cancel,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (_page != _AccessPage.landing)
                    IconButton(
                      key: const Key('auth-back-button'),
                      onPressed: _loading
                          ? null
                          : () => _go(_AccessPage.landing),
                      tooltip: 'Voltar',
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                  const Spacer(),
                ],
              ),
              if (!_entry)
                const Align(
                  alignment: Alignment.centerLeft,
                  child: RamoBrandLockup(),
                ),
              if (_entry) ...[
                Text(
                  widget.driver ? 'Motorista' : 'Passageiro',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 8),
                _heading(
                  widget.driver ? 'Entre para dirigir' : 'Entre no Ramo Nessa',
                  '',
                ),
                const SizedBox(height: 22),
                _field(
                  'auth-email-field',
                  _identifier,
                  widget.driver ? 'Usuário ou e-mail' : 'E-mail',
                  keyboard: widget.driver
                      ? TextInputType.text
                      : TextInputType.emailAddress,
                  hints: [
                    widget.driver
                        ? AutofillHints.username
                        : AutofillHints.email,
                  ],
                ),
                const SizedBox(height: 12),
                _field(
                  'auth-password-field',
                  _password,
                  'Senha',
                  secret: true,
                  hints: const [AutofillHints.password],
                ),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    MergeSemantics(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Checkbox(
                            key: const Key('auth-remember-password'),
                            value: _rememberPassword,
                            onChanged: _loading ? null : _setRememberPassword,
                          ),
                          GestureDetector(
                            onTap: _loading
                                ? null
                                : () =>
                                      _setRememberPassword(!_rememberPassword),
                            child: const Text('Lembrar minha senha'),
                          ),
                        ],
                      ),
                    ),
                    if (widget.onRecoverPassword != null)
                      TextButton(
                        key: const Key('auth-forgot-password'),
                        onPressed: _loading ? null : widget.onRecoverPassword,
                        child: const Text('Esqueci minha senha'),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                FilledButton(
                  key: const Key('auth-primary-button'),
                  style: FilledButton.styleFrom(
                    backgroundColor: RamoColors.brandYellow,
                    foregroundColor: RamoColors.brandBlack,
                    minimumSize: const Size(0, 52),
                  ),
                  onPressed: _loading ? null : _submit,
                  child: const Text('Entrar'),
                ),
                if (widget.socialAccess?.providers.isNotEmpty == true) ...[
                  const SizedBox(height: 16),
                  const Row(
                    children: [
                      Expanded(child: Divider()),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12),
                        child: Text('ou continue com'),
                      ),
                      Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      for (final provider
                          in widget.socialAccess!.providers) ...[
                        if (provider != widget.socialAccess!.providers.first)
                          const SizedBox(width: 10),
                        Expanded(child: _providerButton(provider)),
                      ],
                    ],
                  ),
                ],
                TextButton(
                  key: const Key('auth-create-account-button'),
                  onPressed: _loading ? null : () => _go(_AccessPage.register),
                  child: Text(
                    widget.driver
                        ? 'Seja um motorista parceiro'
                        : 'Criar conta com e-mail',
                  ),
                ),
                if (_loading) const LinearProgressIndicator(),
              ] else if (_socialPage) ...[
                _heading(
                  _page == _AccessPage.socialLink
                      ? 'Vincule sua conta'
                      : 'Complete seu cadastro',
                  _page == _AccessPage.socialLink
                      ? 'Entre na sua conta para manter seu histórico.'
                      : 'Confirme seus dados para continuar.',
                ),
                const SizedBox(height: 26),
                if (_page == _AccessPage.socialLink) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: _providerIcon(_provider!),
                    title: Text('Conta ${_provider!.label} confirmada'),
                  ),
                  _field(
                    'social-account-field',
                    _identifier,
                    widget.driver ? 'Usuário ou e-mail' : 'E-mail',
                    keyboard: widget.driver
                        ? TextInputType.text
                        : TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 14),
                  _field(
                    'social-password-field',
                    _password,
                    'Senha do Ramo Nessa',
                    secret: true,
                  ),
                ] else ...[
                  _field(
                    'auth-name-field',
                    _name,
                    'Nome completo',
                    hints: const [AutofillHints.name],
                  ),
                  const SizedBox(height: 14),
                  _field(
                    'auth-phone-field',
                    _phone,
                    'WhatsApp',
                    keyboard: TextInputType.phone,
                    helper: 'Informe o número com DDD.',
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: RamoColors.brandYellow,
                    foregroundColor: RamoColors.brandBlack,
                    minimumSize: const Size(0, 54),
                  ),
                  onPressed: _loading ? null : _submit,
                  child: Text(
                    _page == _AccessPage.socialLink
                        ? 'Confirmar vínculo'
                        : 'Continuar',
                  ),
                ),
                if (_loading) const LinearProgressIndicator(),
                if (_page == _AccessPage.socialLink &&
                    widget.onRecoverPassword != null)
                  TextButton(
                    onPressed: _loading ? null : widget.onRecoverPassword,
                    child: const Text('Esqueci minha senha'),
                  ),
                if (_page == _AccessPage.socialRegister) ...[
                  if (widget.driver)
                    const Padding(
                      padding: EdgeInsets.only(top: 14),
                      child: Text(
                        'A seguir, CPF, veículo e documentos.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  TextButton(
                    onPressed: _loading
                        ? null
                        : () => _go(_AccessPage.socialLink),
                    child: const Text('Já tenho conta no Ramo Nessa'),
                  ),
                ],
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
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      _error!,
                      key: const Key('auth-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}
