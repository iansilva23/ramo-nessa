import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/driver_core_config.dart';

class DriverSettingsScreen extends StatelessWidget {
  const DriverSettingsScreen({super.key});

  Future<void> _openSettings(BuildContext context, {bool location = false}) async {
    if (kIsWeb) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(location ? 'Localização no navegador' : 'Permissões no navegador'),
          content: Text(location
              ? 'Abra as permissões deste site no menu ao lado do endereço e permita a localização. Confira também se o GPS está ligado no aparelho.'
              : 'Abra as permissões deste site no menu ao lado do endereço para gerenciar localização e notificações.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Entendi'),
            ),
          ],
        ),
      );
      return;
    }
    var opened = false;
    try {
      opened = location
          ? await Geolocator.openLocationSettings()
          : await Geolocator.openAppSettings();
    } catch (_) {
      opened = false;
    }
    if (!context.mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Abra as configurações do aparelho para ajustar as permissões do Ramo Nessa.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Configurações')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.all(RamoSpacing.lg),
              children: [
                Text('Do seu jeito', style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                )),
                const SizedBox(height: 8),
                Text('Gerencie aparência, permissões e preferências do aplicativo.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceVariant)),
                const SizedBox(height: 24),
                Semantics(
                  header: true,
                  child: Text('Permissões e aparelho',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 12),
                Card(
                  margin: EdgeInsets.zero,
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        leading: const CircleAvatar(child: Icon(Icons.settings_rounded)),
                        title: const Text('Configurações do aplicativo'),
                        subtitle: const Text(kIsWeb
                            ? 'Localização e notificações neste navegador.'
                            : 'Permissões, notificações, bateria e dados do sistema.'),
                        trailing: const Icon(kIsWeb ? Icons.info_outline_rounded : Icons.open_in_new_rounded),
                        onTap: () => _openSettings(context),
                      ),
                      const Divider(height: 1, indent: 72),
                      ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        leading: const CircleAvatar(child: Icon(Icons.location_on_rounded)),
                        title: const Text('Configurações de localização'),
                        subtitle: const Text('GPS e serviços de localização do aparelho.'),
                        trailing: const Icon(kIsWeb ? Icons.info_outline_rounded : Icons.open_in_new_rounded),
                        onTap: () => _openSettings(context, location: true),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Semantics(
                  header: true,
                  child: Text('Aparência',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 12),
                const Card(margin: EdgeInsets.zero, child: RamoAppearanceTile()),
                const SizedBox(height: 24),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.info_outline_rounded),
                  title: Text('Versão'),
                  subtitle: Text('${DriverCoreConfig.appVersion} (build ${DriverCoreConfig.appBuild})'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
