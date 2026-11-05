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
    if (mounted) {
      setState(() {
        _all = all;
        _busy = false;
      });
    }
  }

  Future<void> _save(bool all) async {
    setState(() {
      _busy = true;
      _feedback = null;
    });
    try {
      final synced = await widget.savePreference(all).timeout(const Duration(seconds: 12));
      if (!mounted) return;
      setState(() {
        _all = all;
        _feedback = synced
            ? 'Preferência salva.'
            : 'Preferência salva neste aparelho. A sincronização dos avisos está pendente; tente novamente com internet.';
      });
    } catch (_) {
      if (mounted) {
        setState(() => _feedback = 'Não foi possível confirmar o salvamento. Tente novamente.');
      }
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
      ok = await widget.requestNotifications().timeout(const Duration(seconds: 30));
    } catch (_) {}
    if (mounted) {
      setState(() {
        _busy = false;
        _feedback = ok
            ? 'Notificações ativadas e cadastro confirmado.'
            : 'A ativação não foi confirmada. Confira as orientações e tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: colors.primaryContainer,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Icon(Icons.notifications_active_outlined,
                          size: 32, color: colors.onPrimaryContainer),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text('Fique por dentro', style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text(widget.notificationHelp(),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      height: 1.5, color: colors.onSurfaceVariant,
                    )),
                const SizedBox(height: 20),
                if (_busy) ...[
                  const LinearProgressIndicator(
                    semanticsLabel: 'Atualizando notificações',
                  ),
                  const SizedBox(height: 12),
                ],
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                  ),
                  onPressed: _busy ? null : _activate,
                  icon: const Icon(Icons.notifications_outlined),
                  label: Text(_busy
                      ? 'Aguarde...'
                      : 'Ativar ou verificar notificações'),
                ),
                const SizedBox(height: 24),
                Card(
                  margin: EdgeInsets.zero,
                  child: SwitchListTile.adaptive(
                    contentPadding: const EdgeInsets.all(16),
                    title: const Text('Todas as notificações'),
                    subtitle: Text(_all
                        ? 'Inclui novidades e promoções autorizadas.'
                        : 'Somente avisos importantes de corridas, mensagens, pagamentos e serviço.'),
                    value: _all,
                    onChanged: _busy ? null : _save,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Esta escolha vale para este aparelho. Autorizar novidades não substitui as preferências de privacidade e marketing da sua conta.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    height: 1.5, color: colors.onSurfaceVariant,
                  ),
                ),
                if (_feedback != null) ...[
                  const SizedBox(height: 20),
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colors.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(_feedback!),
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
}
