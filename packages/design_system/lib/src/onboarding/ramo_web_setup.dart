import 'package:flutter/material.dart';

/// Optional web installation banner. Never blocks entry or requests permissions.
/// Native permission onboarding continues to use its existing gate.
class RamoWebSetup extends StatefulWidget {
  const RamoWebSetup({super.key, required this.role, required this.readCompleted,
    required this.saveCompleted, required this.readSnapshot,
    required this.requestLocation, required this.requestNotifications,
    required this.install, required this.saveNotificationPreference,
    this.readNotificationPreference, required this.child});
  final String role;
  final Future<bool> Function() readCompleted;
  final Future<void> Function() saveCompleted;
  final Future<Map<String, Object?>> Function() readSnapshot;
  final Future<String> Function() requestLocation;
  final Future<bool> Function() requestNotifications;
  final Future<String> Function() install;
  final Future<void> Function(bool) saveNotificationPreference;
  final Future<bool> Function()? readNotificationPreference;
  final Widget child;
  @override
  State<RamoWebSetup> createState() => _RamoWebSetupState();
}

class _RamoWebSetupState extends State<RamoWebSetup> with WidgetsBindingObserver {
  Map<String, Object?>? _snapshot;
  bool _dismissed = false;
  bool _busy = false;
  int _revision = 0;
  bool get _installed => _snapshot?['installed'] == true || _snapshot?['standalone'] == true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }
  Future<void> _refresh() async {
    final revision = ++_revision;
    try {
      final snapshot = await widget.readSnapshot().timeout(const Duration(seconds: 3));
      if (mounted && revision == _revision) setState(() => _snapshot = snapshot);
    } catch (_) {
      // Failure to read installation state must never block the application.
    }
  }
  Future<void> _install() async {
    if (_busy) return;
    setState(() => _busy = true);
    String result;
    try {
      // First async call stays attached to the tap for browser user activation.
      result = await widget.install().timeout(const Duration(seconds: 30));
    } catch (_) {
      result = 'error';
    }
    await _refresh();
    if (!mounted) return;
    setState(() => _busy = false);
    if (result == 'installed' || _installed) return;
    if (result == 'dismissed') return;
    if (result == 'accepted') {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(
        content: Text('Instalação solicitada. Aguarde o navegador concluir e procure o ícone na Tela de Início.'),
      ));
      return;
    }
    _showHelp();
  }
  void _showHelp() {
    final ios = _snapshot?['ios'] == true;
    final embedded = _snapshot?['embedded'] == true;
    showModalBottomSheet<void>(
      context: context, isScrollControlled: true, useSafeArea: true,
      builder: (context) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Adicionar à Tela de Início', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            if (embedded) const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text('Abra este link no navegador do celular para adicionar o app.'),
            ),
            Text(ios
              ? '1. Abra este endereço no Safari.\n\n2. Toque em Compartilhar.\n\n3. Escolha “Adicionar à Tela de Início” e confirme em “Adicionar”.'
              : 'Abra o menu do navegador e procure “Instalar app” ou “Adicionar à Tela de Início”. Se a opção não aparecer, continue usando pelo navegador.'),
            const SizedBox(height: 16),
            const Text('Quando o app pedir sua localização, aceite para usar os recursos do mapa. Os avisos podem ser ativados em Perfil → Notificações.'),
            if (ios) const Padding(padding: EdgeInsets.only(top: 12),
              child: Text('No iPhone, abra pelo ícone da Tela de Início para ativar notificações.')),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, child: FilledButton(
              onPressed: () => Navigator.pop(context), child: const Text('Entendi'),
            )),
          ]),
        ),
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
    if (_snapshot == null || _installed || _dismissed) return widget.child;
    return Column(children: [
      Material(color: const Color(0xFFFFCC00), child: SafeArea(bottom: false,
        child: Row(children: [
          Expanded(child: InkWell(
            onTap: _busy ? null : _install,
            child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 48),
              child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Center(child: Text(_busy ? 'Aguarde…' : 'Adicionar app à Tela de Início',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.black, fontSize: 13, fontWeight: FontWeight.w800),
                )),
              ),
            ),
          )),
          IconButton(tooltip: 'Fechar aviso de instalação', color: Colors.black,
            onPressed: () => setState(() => _dismissed = true), icon: const Icon(Icons.close, size: 20)),
        ]),
      )),
      Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: widget.child)),
    ]);
  }
}
