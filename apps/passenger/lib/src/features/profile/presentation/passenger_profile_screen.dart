import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/auth/phone_auth_service.dart';
import '../../payments/data/passenger_payment_service.dart';
import '../../payments/domain/passenger_payment_policy.dart';

class PassengerProfileScreen extends StatefulWidget {
  const PassengerProfileScreen({
    super.key,
    required this.authService,
    required this.accessToken,
    required this.onOpenActivity,
    this.paymentService,
    this.onLogout,
    this.previewMode = false,
  });

  final PhoneAuthService? authService;
  final String? accessToken;
  final VoidCallback onOpenActivity;
  final PassengerPaymentService? paymentService;
  final Future<bool> Function()? onLogout;
  final bool previewMode;

  @override
  State<PassengerProfileScreen> createState() =>
      _PassengerProfileScreenState();
}

class _PassengerProfileScreenState extends State<PassengerProfileScreen> {
  PassengerAccount? _account;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    final service = widget.authService;
    final token = widget.accessToken?.trim();

    if (widget.previewMode) {
      if (!mounted) return;
      setState(() {
        _account = const PassengerAccount(
          subjectId: 'preview-passenger',
          phoneE164: '+55 88 99999-9999',
          email: 'preview@ramonessa.app',
          fullName: 'Passageiro Preview',
        );
        _loading = false;
      });
      return;
    }

    if (service == null || token == null || token.length < 20) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Conta indisponível neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final account = await service.passengerAccount(token);
      if (!mounted) return;
      setState(() {
        _account = account;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _openPersonalData() async {
    final account = _account;
    final service = widget.authService;
    final token = widget.accessToken?.trim();
    if (account == null) return;

    if (widget.previewMode) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => _PassengerPersonalDataScreen(
            account: account,
          ),
        ),
      );
      return;
    }

    if (service == null || token == null || token.length < 20) return;

    final updated = await Navigator.of(context).push<PassengerAccount>(
      MaterialPageRoute<PassengerAccount>(
        builder: (_) => _PassengerPersonalDataScreen(
          account: account,
          service: service,
          accessToken: token,
        ),
      ),
    );

    if (updated != null && mounted) {
      setState(() => _account = updated);
    }
  }

  Future<void> _logout() async {
    final logout = widget.onLogout;
    if (logout == null) return;
    final ok = await logout();
    if (!mounted || ok) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Não foi possível encerrar a sessão agora. Tente novamente.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final account = _account;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            Text(
              'Perfil',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Sua conta e preferências do Ramo Nessa.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: RamoColors.muted,
                  ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (_loading && account == null)
              const Padding(
                padding: EdgeInsets.only(top: 56),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && account == null)
              _ProfileInfoMessage(message: _error!)
            else if (account != null) ...[
              _ProfileHero(account: account),
              const SizedBox(height: RamoSpacing.lg),
              _ProfileOption(
                key: const Key('passenger-personal-data'),
                icon: Icons.badge_outlined,
                title: 'Dados pessoais',
                subtitle: account.email ?? account.phoneE164,
                onTap: _openPersonalData,
              ),
              _ProfileOption(
                key: const Key('passenger-payment-methods'),
                icon: Icons.credit_card_rounded,
                title: 'Formas de pagamento',
                subtitle: 'Pix, cartão, carteira e disponibilidade',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => _PassengerPaymentMethodsScreen(
                        service: widget.paymentService,
                      ),
                    ),
                  );
                },
              ),
              _ProfileOption(
                key: const Key('passenger-ride-history'),
                icon: Icons.receipt_long_rounded,
                title: 'Histórico de corridas',
                subtitle: 'Veja suas viagens e valores',
                onTap: widget.onOpenActivity,
              ),
              if (widget.onLogout != null)
                _ProfileOption(
                  key: const Key('passenger-logout'),
                  icon: Icons.logout_rounded,
                  title: 'Sair',
                  subtitle: 'Encerrar a sessão neste aparelho',
                  onTap: _logout,
                  destructive: true,
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProfileHero extends StatelessWidget {
  const _ProfileHero({required this.account});

  final PassengerAccount account;

  @override
  Widget build(BuildContext context) {
    final name = account.fullName?.trim().isNotEmpty == true
        ? account.fullName!.trim()
        : 'Passageiro Ramo Nessa';

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.brandBlack,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 32,
            backgroundColor: RamoColors.brandYellow,
            foregroundColor: RamoColors.brandBlack,
            child: account.photoUrl == null
                ? const Icon(Icons.person_rounded, size: 34)
                : ClipOval(
                    child: Image.network(
                      account.photoUrl!,
                      width: 64,
                      height: 64,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.person_rounded, size: 34),
                    ),
                  ),
          ),
          const SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 19,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  account.phoneE164,
                  style: const TextStyle(color: Colors.white70),
                ),
                if (account.email?.isNotEmpty == true) ...[
                  const SizedBox(height: 2),
                  Text(
                    account.email!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileOption extends StatelessWidget {
  const _ProfileOption({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(
          icon,
          color: destructive
              ? Theme.of(context).colorScheme.error
              : RamoColors.brandBlack,
        ),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: destructive ? Theme.of(context).colorScheme.error : null,
        ),
      ),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _ProfileInfoMessage extends StatelessWidget {
  const _ProfileInfoMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          const Icon(Icons.person_off_outlined, size: 42),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _PassengerPersonalDataScreen extends StatefulWidget {
  const _PassengerPersonalDataScreen({
    required this.account,
    this.service,
    this.accessToken,
  });

  final PassengerAccount account;
  final PhoneAuthService? service;
  final String? accessToken;

  @override
  State<_PassengerPersonalDataScreen> createState() =>
      _PassengerPersonalDataScreenState();
}

class _PassengerPersonalDataScreenState
    extends State<_PassengerPersonalDataScreen> {
  late final TextEditingController _name =
      TextEditingController(text: widget.account.fullName ?? '');
  late final TextEditingController _email =
      TextEditingController(text: widget.account.email ?? '');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final service = widget.service;
    final token = widget.accessToken;
    if (service == null || token == null) {
      Navigator.of(context).pop();
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final updated = await service.updatePassengerAccount(
        accessToken: token,
        fullName: _name.text,
        email: _email.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dados pessoais')),
      body: ListView(
        padding: const EdgeInsets.all(RamoSpacing.lg),
        children: [
          TextField(
            controller: _name,
            enabled: !_saving && widget.service != null,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nome completo'),
          ),
          const SizedBox(height: RamoSpacing.md),
          TextField(
            controller: _email,
            enabled: !_saving && widget.service != null,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'E-mail'),
          ),
          const SizedBox(height: RamoSpacing.md),
          TextFormField(
            initialValue: widget.account.phoneE164,
            enabled: false,
            decoration: const InputDecoration(
              labelText: 'Telefone verificado',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: RamoSpacing.md),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: RamoSpacing.xl),
          FilledButton(
            onPressed:
                _saving || widget.service == null ? null : _save,
            child: _saving
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Salvar alterações'),
          ),
        ],
      ),
    );
  }
}


class _PassengerPaymentMethodsScreen extends StatefulWidget {
  const _PassengerPaymentMethodsScreen({required this.service});

  final PassengerPaymentService? service;

  @override
  State<_PassengerPaymentMethodsScreen> createState() =>
      _PassengerPaymentMethodsScreenState();
}

class _PassengerPaymentMethodsScreenState
    extends State<_PassengerPaymentMethodsScreen> {
  PassengerPaymentPolicy? _policy;
  int? _walletCents;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    final service = widget.service;
    if (service == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Formas de pagamento indisponíveis neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final policy = await service.paymentPolicy();
      int? wallet;
      if (policy.passengerWalletEnabled) {
        wallet = await service.walletBalanceCents();
      }
      if (!mounted) return;
      setState(() {
        _policy = policy;
        _walletCents = wallet;
        _loading = false;
      });
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
    final policy = _policy;

    return Scaffold(
      appBar: AppBar(title: const Text('Formas de pagamento')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(RamoSpacing.lg),
          children: [
            if (_loading && policy == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && policy == null)
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: RamoColors.muted),
                ),
              )
            else if (policy != null) ...[
              _PaymentMethodTile(
                icon: Icons.qr_code_2_rounded,
                title: 'Pix',
                enabled: policy.allowedMethods.contains('pix'),
                subtitle: 'Pagamento confirmado antes do envio ao motorista',
              ),
              _PaymentMethodTile(
                icon: Icons.credit_card_rounded,
                title: 'Cartão',
                enabled: policy.allowedMethods.contains('card'),
                subtitle: 'Pagamento à vista com tokenização segura',
              ),
              _PaymentMethodTile(
                icon: Icons.account_balance_wallet_rounded,
                title: 'Carteira Ramo Nessa',
                enabled: policy.passengerWalletEnabled &&
                    policy.allowedMethods.contains('wallet'),
                subtitle: _walletCents == null
                    ? 'Saldo indisponível'
                    : 'Saldo: ${_formatCents(_walletCents!)}',
              ),
              _PaymentMethodTile(
                icon: Icons.payments_outlined,
                title: 'Dinheiro',
                enabled: policy.cashEnabled &&
                    policy.allowedMethods.contains('cash'),
                subtitle: policy.cashEnabled
                    ? 'Disponível conforme a política da operação'
                    : 'Em breve',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PaymentMethodTile extends StatelessWidget {
  const _PaymentMethodTile({
    required this.icon,
    required this.title,
    required this.enabled,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final bool enabled;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 5),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(icon, color: RamoColors.brandBlack),
      ),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(subtitle),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: enabled
              ? RamoColors.brandYellow
              : RamoColors.surfaceRaised,
          borderRadius: BorderRadius.circular(RamoRadius.pill),
        ),
        child: Text(
          enabled ? 'Disponível' : 'Indisponível',
          style: const TextStyle(
            color: RamoColors.brandBlack,
            fontWeight: FontWeight.w900,
            fontSize: 11,
          ),
        ),
      ),
    );
  }
}


String _formatCents(int cents) {
  final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
  return 'R\$ $value';
}
