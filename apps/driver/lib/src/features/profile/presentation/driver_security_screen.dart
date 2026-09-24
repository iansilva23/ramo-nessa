import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

class DriverSecurityScreen extends StatefulWidget {
  const DriverSecurityScreen({
    super.key,
    required this.api,
    this.profile,
  });

  final DriverApi api;
  final DriverProfileSnapshot? profile;

  @override
  State<DriverSecurityScreen> createState() => _DriverSecurityScreenState();
}

class _DriverSecurityScreenState extends State<DriverSecurityScreen> {
  DriverSecuritySnapshot? _security;
  bool _loading = true;
  bool _revoking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final security = await widget.api.security();
      if (!mounted) return;
      setState(() {
        _security = security;
        _loading = false;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar os dados de segurança agora.';
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
    if (_revoking) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Encerrar outras sessões?'),
        content: const Text(
          'Outros celulares e aparelhos conectados à sua conta serão '
          'desconectados. Este aparelho continuará conectado.',
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
      final result = await widget.api.revokeOtherSessions();
      if (!mounted) return;
      setState(() => _revoking = false);

      final message = result.revokedSessions == 0
          ? 'Nenhuma outra sessão ativa foi encontrada.'
          : '${result.revokedSessions} sessão(ões) encerrada(s) com segurança.';

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _revoking = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _revoking = false;
        _error = 'Não conseguimos encerrar as outras sessões agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final security = _security;
    final profile = widget.profile;

    return Scaffold(
      appBar: AppBar(title: const Text('Segurança')),
      body: RefreshIndicator(
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
            Container(
              padding: const EdgeInsets.all(RamoSpacing.lg),
              decoration: BoxDecoration(
                color: RamoColors.brandBlack,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: const Row(
                children: [
                  Icon(
                    Icons.shield_rounded,
                    color: RamoColors.brandYellow,
                    size: 34,
                  ),
                  SizedBox(width: RamoSpacing.md),
                  Expanded(
                    child: Text(
                      'Sua sessão usa autenticação por telefone e token seguro armazenado no aparelho.',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'Conta',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.phone_iphone_rounded),
              title: const Text('Telefone'),
              subtitle: Text(profile?.phoneE164 ?? 'Não informado'),
            ),
            if (profile?.email?.trim().isNotEmpty == true)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.alternate_email_rounded),
                title: const Text('E-mail'),
                subtitle: Text(profile!.email!),
              ),
            const Divider(),
            const SizedBox(height: RamoSpacing.md),
            const Text(
              'Sessão atual',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            if (_loading && security == null)
              const Center(child: CircularProgressIndicator())
            else if (security != null) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.login_rounded),
                title: const Text('Conectado desde'),
                subtitle: Text(_dateTime(security.createdAt)),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_rounded),
                title: const Text('Sessão válida até'),
                subtitle: Text(_dateTime(security.expiresAt)),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: RamoSpacing.xl),
            FilledButton.icon(
              onPressed: _revoking ? null : _revokeOthers,
              icon: const Icon(Icons.devices_other_rounded),
              label: _revoking
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Encerrar sessões em outros aparelhos'),
            ),
            const SizedBox(height: RamoSpacing.sm),
            const Text(
              'Use esta opção se você perdeu um aparelho, vendeu um celular '
              'ou percebeu um acesso que não reconhece.',
              style: TextStyle(
                color: RamoColors.muted,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
