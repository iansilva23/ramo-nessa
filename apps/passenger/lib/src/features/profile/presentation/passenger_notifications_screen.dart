import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../../core/notifications/firebase_push_coordinator.dart';

class PassengerNotificationsScreen extends StatefulWidget {
  const PassengerNotificationsScreen({
    super.key,
    this.coordinator,
  });

  final FirebasePushCoordinator? coordinator;

  @override
  State<PassengerNotificationsScreen> createState() =>
      _PassengerNotificationsScreenState();
}

class _PassengerNotificationsScreenState
    extends State<PassengerNotificationsScreen> {
  AuthorizationStatus? _status;
  bool _loading = true;
  bool _requesting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final coordinator = widget.coordinator;
    if (coordinator == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Notificações push indisponíveis neste aparelho agora.';
      });
      return;
    }

    try {
      final status = await coordinator.authorizationStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos verificar a permissão agora.';
      });
    }
  }

  Future<void> _request() async {
    final coordinator = widget.coordinator;
    if (coordinator == null || _requesting) return;

    setState(() {
      _requesting = true;
      _error = null;
    });

    try {
      final status = await coordinator.requestNotificationPermission();
      if (!mounted) return;
      setState(() {
        _status = status;
        _requesting = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _requesting = false;
        _error = 'Não conseguimos ativar as notificações agora.';
      });
    }
  }

  bool get _enabled =>
      _status == AuthorizationStatus.authorized ||
      _status == AuthorizationStatus.provisional;

  String get _statusLabel => switch (_status) {
        AuthorizationStatus.authorized => 'Ativadas',
        AuthorizationStatus.provisional => 'Ativadas provisoriamente',
        AuthorizationStatus.denied ||
        AuthorizationStatus.deniedPermanently =>
          'Desativadas',
        AuthorizationStatus.notDetermined => 'Ainda não configuradas',
        null => 'Verificando…',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
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
                color: _enabled
                    ? RamoColors.brandBlack
                    : RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: Row(
                children: [
                  Icon(
                    _enabled
                        ? Icons.notifications_active_rounded
                        : Icons.notifications_off_outlined,
                    size: 34,
                    color: _enabled
                        ? RamoColors.brandYellow
                        : RamoColors.brandBlack,
                  ),
                  const SizedBox(width: RamoSpacing.md),
                  Expanded(
                    child: Text(
                      _loading ? 'Verificando…' : _statusLabel,
                      style: TextStyle(
                        color: _enabled ? Colors.white : null,
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.md),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            if (!_enabled) ...[
              const SizedBox(height: RamoSpacing.lg),
              FilledButton.icon(
                onPressed: _requesting ? null : _request,
                icon: const Icon(Icons.notifications_active_rounded),
                label: _requesting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Ativar notificações'),
              ),
            ],
            const SizedBox(height: RamoSpacing.xl),
            const _InfoTile(
              icon: Icons.local_taxi_rounded,
              title: 'Corridas',
              subtitle:
                  'Motorista encontrado, chegada, andamento e atualizações importantes.',
            ),
            const _InfoTile(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Pagamentos',
              subtitle: 'Confirmações, estornos e avisos da carteira.',
            ),
            const _InfoTile(
              icon: Icons.campaign_outlined,
              title: 'Avisos do Ramo Nessa',
              subtitle:
                  'Eventos, manutenção e atualizações importantes do aplicativo.',
            ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'App ${RamoCoreConfig.appVersion} · build ${RamoCoreConfig.appBuild}',
              style: TextStyle(color: RamoColors.muted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(icon, color: RamoColors.brandBlack),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(subtitle),
    );
  }
}
