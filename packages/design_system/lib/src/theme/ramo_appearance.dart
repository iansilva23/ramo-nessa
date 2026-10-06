import 'package:flutter/material.dart';

/// The apps configure storage once; widget tests can use this without plugins.
class RamoAppearance extends ValueNotifier<ThemeMode> {
  RamoAppearance() : super(ThemeMode.system);
  static final instance = RamoAppearance();
  Future<void> Function(String value)? _save;
  Future<void> initialize({required Future<String?> Function() read,
    required Future<void> Function(String value) save}) async {
    _save = save;
    try {
      final stored = await read();
      value = ThemeMode.values.firstWhere((mode) => mode.name == stored, orElse: () => ThemeMode.system);
    } catch (_) { /* A storage failure must not block startup. */ }
  }
  Future<bool> select(ThemeMode mode) async {
    try { await _save?.call(mode.name); }
    catch (_) { return false; }
    value = mode;
    return true;
  }
}

class RamoAppearanceTile extends StatelessWidget {
  const RamoAppearanceTile({super.key});
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<ThemeMode>(
    valueListenable: RamoAppearance.instance,
    builder: (context, mode, _) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.palette_outlined),
      title: const Text('Aparência'),
      subtitle: Text(_label(mode)),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: () async {
        final selected = await showDialog<ThemeMode>(context: context, builder: (context) => SimpleDialog(
          title: const Text('Aparência'),
          children: ThemeMode.values.map((choice) => SimpleDialogOption(
            onPressed: () => Navigator.pop(context, choice),
            child: Row(children: [Icon(choice == mode ? Icons.check_circle : Icons.circle_outlined),
              const SizedBox(width: 12), Text(_label(choice))]),
          )).toList(),
        ));
        if (selected == null) return;
        final saved = await RamoAppearance.instance.select(selected);
        if (!saved && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Não foi possível salvar a aparência. Tente novamente.')));
        }
      },
    ),
  );
  static String _label(ThemeMode mode) => switch (mode) {
    ThemeMode.system => 'Seguir sistema', ThemeMode.light => 'Claro', ThemeMode.dark => 'Escuro',
  };
}

/// Used for Maps as well as the Flutter controls, without automatic inversion.
const ramoDarkMapStyle = '[{"elementType":"geometry","stylers":[{"color":"#242a30"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#cbd2da"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#242a30"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#132534"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#3b4148"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#24392d"}]}]';
