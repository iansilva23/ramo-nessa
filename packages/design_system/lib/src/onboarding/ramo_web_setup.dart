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
      backgroundColor: const Color(0xFF17191D),
      barrierColor: const Color(0xB3000000),
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => Material(
        key: const ValueKey('web-install-help-surface'),
        color: const Color(0xFF17191D),
        child: SafeArea(top: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .85),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
              child: DefaultTextStyle(
                style: const TextStyle(color: Color(0xFFF7F7F8), fontSize: 15, height: 1.45),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Expanded(child: Text('TENHA O RAMO NESSA POR PERTO',
                      style: TextStyle(color: Color(0xFFFFCC00), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: .7))),
                    IconButton(tooltip: 'Fechar instruções', color: const Color(0xFFF7F7F8),
                      onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
                  ]),
                  const Text('Adicionar à Tela de Início', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.2)),
                  const SizedBox(height: 10),
                  const Text('Abra pelo ícone do celular, sempre que precisar.', style: TextStyle(color: Color(0xFFBFC4CD))),
                  const SizedBox(height: 24),
                  if (embedded) const Padding(padding: EdgeInsets.only(bottom: 16),
                    child: Text('Abra este link no navegador do celular para adicionar o app.')),
                  if (ios) ...[
                    _helpStep('1', 'Abra este endereço no Safari.', 'Use o navegador da Apple para seguir estas instruções.'),
                    _helpStep('2', 'Toque em Compartilhar.', 'Procure o ícone de compartilhar no menu do navegador.'),
                    _helpStep('3', 'Adicione à Tela de Início.', 'Escolha “Adicionar à Tela de Início” e confirme em “Adicionar”.'),
                  ] else ...[
                    _helpStep('1', 'Abra o menu do navegador.', 'Procure “Instalar app” ou “Adicionar à Tela de Início”.'),
                    _helpStep('2', 'Confirme a instalação.', 'Se a opção não aparecer, você pode continuar no navegador.'),
                  ],
                  Container(
                    width: double.infinity, padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: const Color(0xFF24272D), borderRadius: BorderRadius.circular(16)),
                    child: Text(ios
                      ? 'Para ativar notificações no iPhone, abra o Ramo Nessa pelo novo ícone. Os avisos ficam na opção Notificações do Perfil.'
                      : 'Os avisos podem ser ativados na opção Notificações do Perfil. Aceite a localização quando o mapa solicitar.',
                      style: const TextStyle(color: Color(0xFFD8DBE2), fontSize: 13)),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(width: double.infinity, child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFFFCC00), foregroundColor: const Color(0xFF101114),
                      minimumSize: const Size(0, 52),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    onPressed: () => Navigator.pop(context), child: const Text('Entendi'),
                  )),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
  Widget _helpStep(String number, String title, String description) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(width: 32, height: 32, alignment: Alignment.center,
        decoration: BoxDecoration(color: const Color(0xFFFFCC00), borderRadius: BorderRadius.circular(10)),
        child: Text(number, style: const TextStyle(color: Color(0xFF101114), fontWeight: FontWeight.w800))),
      const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(description, style: const TextStyle(color: Color(0xFFBFC4CD), fontSize: 13)),
      ])),
    ]),
  );

  @override
  Widget build(BuildContext context) {
    final visible = _snapshot != null && !_installed && !_dismissed;
    // Keep the app subtree in the same slot while the banner appears/disappears.
    return Column(children: [
      if (!visible) const SizedBox.shrink() else Material(color: const Color(0xFFFFCC00), child: SafeArea(bottom: false,
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
      Expanded(child: MediaQuery.removePadding(context: context, removeTop: visible, child: widget.child)),
    ]);
  }
}
