import 'package:flutter/material.dart';

class RamoNotificationSettings extends StatefulWidget {
  const RamoNotificationSettings({
    super.key,
    required this.readPreference,
    required this.savePreference,
    required this.requestNotifications,
    required this.notificationHelp,
  });

  final Future<bool> Function() readPreference;
  final Future<bool> Function(bool all) savePreference;
  final Future<bool> Function() requestNotifications;
  final String Function() notificationHelp;

  @override
  State<RamoNotificationSettings> createState() =>
      _RamoNotificationSettingsState();
}

class _RamoNotificationSettingsState extends State<RamoNotificationSettings> {
  bool _all = false;
  bool _busy = true;
  String? _feedback;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    bool all = false;
    try {
      all = await widget.readPreference();
    } catch (_) {}
    if (mounted)
      setState(() {
        _all = all;
        _busy = false;
      });
  }

  Future<void> _save(bool all) async {
    setState(() {
      _busy = true;
      _feedback = null;
    });
    try {
      final synced = await widget.savePreference(all);
      if (!mounted) return;
      setState(() {
        _all = all;
        _feedback = synced
            ? 'Preferência salva.'
            : 'Preferência salva neste aparelho. A sincronização dos avisos está pendente; tente novamente com internet.';
      });
    } catch (_) {
      if (mounted)
        setState(() => _feedback = 'Não foi possível salvar. Tente novamente.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _activate() async {
    setState(() {
      _busy = true;
      _feedback = null;
    });
    bool ok = false;
    try {
      ok = await widget.requestNotifications();
    } catch (_) {}
    if (mounted)
      setState(() {
        _busy = false;
        _feedback = ok
            ? 'Notificações ativadas e cadastro confirmado.'
            : 'A ativação não foi confirmada. Confira as orientações e tente novamente.';
      });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notificações')),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          const Icon(Icons.notifications_rounded,
              size: 48, color: Color(0xFFFFCC00)),
          const SizedBox(height: 20),
          Text(widget.notificationHelp(), style: const TextStyle(height: 1.5)),
          const SizedBox(height: 16),
          FilledButton(
              onPressed: _busy ? null : _activate,
              child: Text(
                  _busy ? 'Aguarde...' : 'Ativar ou verificar notificações')),
          const SizedBox(height: 24),
          SwitchListTile.adaptive(
            title: const Text('Todas as notificações'),
            subtitle: Text(_all
                ? 'Inclui novidades e promoções autorizadas.'
                : 'Somente avisos importantes de corridas, mensagens, pagamentos e serviço.'),
            value: _all,
            onChanged: _busy ? null : _save,
          ),
          const SizedBox(height: 12),
          const Text(
              'Esta escolha vale para este aparelho. Autorizar novidades não substitui as preferências de privacidade e marketing da sua conta.',
              style: TextStyle(fontSize: 12, height: 1.5)),
          if (_feedback != null) ...[
            const SizedBox(height: 20),
            Text(_feedback!)
          ],
        ]),
      );
}
