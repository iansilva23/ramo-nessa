import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/driver_core_config.dart';
import '../../../core/notifications/firebase_push_coordinator.dart';

class DriverNotificationsScreen extends StatefulWidget {
  const DriverNotificationsScreen({
    super.key,
    required this.coordinator,
  });

  final FirebasePushCoordinator? coordinator;

  @override
  State<DriverNotificationsScreen> createState() =>
      _DriverNotificationsScreenState();
}

class _DriverNotificationsScreenState
    extends State<DriverNotificationsScreen> {
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
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final coordinator = widget.coordinator;
      if (coordinator == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error =
              'As notificações push não estão disponíveis neste aparelho agora.';
        });
        return;
      }
      final status = await coordinator.authorizationStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos verificar a permissão agora.';
      });
    }
  }

  Future<void> _requestPermission() async {
    if (_requesting) return;
    setState(() {
      _requesting = true;
      _error = null;
    });

    try {
      final coordinator = widget.coordinator;
      if (coordinator == null) {
        if (!mounted) return;
        setState(() {
          _requesting = false;
          _error =
              'As notificações push não estão disponíveis neste aparelho agora.';
        });
        return;
      }
      final status =
          await coordinator.requestNotificationPermission();
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

  String _statusLabel(AuthorizationStatus? status) {
    return switch (status) {
      AuthorizationStatus.authorized => 'Ativadas',
      AuthorizationStatus.provisional => 'Ativadas provisoriamente',
      AuthorizationStatus.denied => 'Desativadas',
      AuthorizationStatus.notDetermined => 'Ainda não configuradas',
      null => 'Verificando…',
    };
  }

  IconData _statusIcon(AuthorizationStatus? status) {
    return switch (status) {
      AuthorizationStatus.authorized ||
      AuthorizationStatus.provisional =>
        Icons.notifications_active_rounded,
      AuthorizationStatus.denied => Icons.notifications_off_rounded,
      _ => Icons.notifications_none_rounded,
    };
  }

  @override
  Widget build(BuildContext context) {
    final enabled = _status == AuthorizationStatus.authorized ||
        _status == AuthorizationStatus.provisional;

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
                color: enabled
                    ? RamoColors.brandBlack
                    : RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: Row(
                children: [
                  Icon(
                    _statusIcon(_status),
                    size: 34,
                    color: enabled
                        ? RamoColors.brandYellow
                        : RamoColors.brandBlack,
                  ),
                  const SizedBox(width: RamoSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Status',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _loading
                              ? 'Verificando…'
                              : _statusLabel(_status),
                          style: TextStyle(
                            color: enabled ? Colors.white : null,
                            fontWeight: FontWeight.w900,
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: RamoSpacing.md),
              Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: RamoSpacing.xl),
            if (!enabled)
              FilledButton.icon(
                onPressed: _requesting ? null : _requestPermission,
                icon: const Icon(Icons.notifications_active_rounded),
                label: _requesting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Ativar notificações'),
              ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'O que você recebe',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            const _NotificationInfo(
              icon: Icons.local_taxi_rounded,
              title: 'Corridas',
              subtitle:
                  'Novas ofertas, mudanças de corrida e atualizações importantes.',
            ),
            const _NotificationInfo(
              icon: Icons.campaign_rounded,
              title: 'Avisos da operação',
              subtitle:
                  'Eventos na cidade, manutenção programada e comunicados do Ramo Nessa.',
            ),
            const _NotificationInfo(
              icon: Icons.system_update_alt_rounded,
              title: 'Atualizações do app',
              subtitle:
                  'Avisos quando houver versão nova ou atualização necessária.',
            ),
            const SizedBox(height: RamoSpacing.xl),
            Text(
              'App ${DriverCoreConfig.appVersion} · build ${DriverCoreConfig.appBuild}',
              style: const TextStyle(
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

class _NotificationInfo extends StatelessWidget {
  const _NotificationInfo({
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
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(subtitle),
    );
  }
}
