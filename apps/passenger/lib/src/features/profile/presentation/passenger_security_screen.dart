import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/auth/password_auth_service.dart';

class PassengerSecurityScreen extends StatefulWidget {
  const PassengerSecurityScreen({
    super.key,
    required this.service,
    required this.accessToken,
    required this.account,
    this.previewMode = false,
  });

  final PasswordAuthService? service;
  final String? accessToken;
  final PassengerAccount account;
  final bool previewMode;

  @override
  State<PassengerSecurityScreen> createState() =>
      _PassengerSecurityScreenState();
}

class _PassengerSecurityScreenState extends State<PassengerSecurityScreen> {
  AuthSecuritySession? _session;
  bool _loading = true;
  bool _revoking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.previewMode) {
      if (!mounted) return;
      setState(() {
        _session = AuthSecuritySession(
          id: 'preview-session',
          subjectType: 'passenger',
          createdAt: DateTime(2026, 9, 24, 9),
          expiresAt: DateTime(2026, 10, 24, 9),
        );
        _loading = false;
      });
      return;
    }

    final service = widget.service;
    final token = widget.accessToken?.trim();
    if (service == null || token == null || token.length < 20) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Segurança da conta indisponível neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await service.securitySession(token);
      if (!mounted) return;
      setState(() {
        _session = session;
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

  String _dateTime(DateTime value) {
    final local = value.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day/$month/${local.year} às $hour:$minute';
  }

  Future<void> _revokeOthers() async {
    if (_revoking || widget.previewMode) return;
    final service = widget.service;
    final token = widget.accessToken?.trim();
    if (service == null || token == null || token.length < 20) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Encerrar outras sessões?'),
        content: const Text(
          'Outros aparelhos conectados à sua conta serão desconectados. '
          'Este aparelho continuará conectado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Encerrar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _revoking = true;
      _error = null;
    });

    try {
      final result = await service.revokeOtherSessions(token);
      if (!mounted) return;
      setState(() => _revoking = false);
      final message = result.revokedSessions == 0
          ? 'Nenhuma outra sessão ativa foi encontrada.'
          : '${result.revokedSessions} sessão(ões) encerrada(s).';
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _revoking = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;

    return Scaffold(
      appBar: AppBar(title: const Text('Segurança')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
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
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
              width: 60,
              height: 60,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: Icon(Icons.shield_outlined,
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                  size: 30),
            ),
            ),
            const SizedBox(height: RamoSpacing.md),
            Semantics(
              header: true,
              child: Text('Sua conta, protegida',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  )),
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text('Confira seus contatos e gerencie o acesso em outros aparelhos.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                )),
            const SizedBox(height: RamoSpacing.md),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'Conta',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.phone_iphone_rounded),
              title: const Text('Telefone cadastrado'),
              subtitle: Text(widget.account.phoneE164),
            ),
            if (widget.account.email?.trim().isNotEmpty == true)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.alternate_email_rounded),
                title: const Text('E-mail'),
                subtitle: Text(widget.account.email!),
              ),
            const Divider(),
            const SizedBox(height: RamoSpacing.md),
            const Text(
              'Sessão atual',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            if (_loading && session == null)
              const Padding(
                padding: EdgeInsets.all(RamoSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (session != null) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.login_rounded),
                title: const Text('Conectado desde'),
                subtitle: Text(_dateTime(session.createdAt)),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_rounded),
                title: const Text('Sessão válida até'),
                subtitle: Text(_dateTime(session.expiresAt)),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.sm),
              Semantics(
                liveRegion: true,
                child: Text(_error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
              TextButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Atualizar dados da sessão'),
              ),
            ],
            const SizedBox(height: RamoSpacing.xl),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              ),
              onPressed: widget.previewMode || _revoking
                  ? null
                  : _revokeOthers,
              icon: const Icon(Icons.devices_other_rounded),
              label: _revoking
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Encerrar sessões em outros aparelhos'),
            ),
          ],
        ),
            ),
          ),
        ),
      ),
    );
  }
}

