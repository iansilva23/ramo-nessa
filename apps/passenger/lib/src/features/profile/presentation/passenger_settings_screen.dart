import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_core_config.dart';

class PassengerSettingsScreen extends StatelessWidget {
  const PassengerSettingsScreen({super.key});

  Future<void> _openAppSettings(BuildContext context) async {
    final opened = await Geolocator.openAppSettings();
    if (!context.mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Não foi possível abrir as configurações do app.'),
      ),
    );
  }

  Future<void> _openLocationSettings(BuildContext context) async {
    final opened = await Geolocator.openLocationSettings();
    if (!context.mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Não foi possível abrir as configurações de localização.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Configurações')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          const Text(
            'Permissões e aparelho',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(child: Icon(Icons.settings_rounded)),
            title: const Text('Configurações do aplicativo'),
            subtitle: const Text(
              'Permissões, notificações, bateria e dados do sistema.',
            ),
            trailing: const Icon(Icons.open_in_new_rounded),
            onTap: () => _openAppSettings(context),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading:
                const CircleAvatar(child: Icon(Icons.location_on_rounded)),
            title: const Text('Configurações de localização'),
            subtitle: const Text('GPS e serviços de localização do aparelho.'),
            trailing: const Icon(Icons.open_in_new_rounded),
            onTap: () => _openLocationSettings(context),
          ),
          const Divider(height: RamoSpacing.xxl),
          const ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.info_outline_rounded),
            title: Text('Versão'),
            subtitle: Text(
              '${RamoCoreConfig.appVersion} '
              '(build ${RamoCoreConfig.appBuild})',
            ),
          ),
          const ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.palette_outlined),
            title: Text('Aparência'),
            subtitle: Text(
              'O Ramo Nessa acompanha o tema claro/escuro do sistema.',
            ),
          ),
        ],
      ),
    );
  }
}
