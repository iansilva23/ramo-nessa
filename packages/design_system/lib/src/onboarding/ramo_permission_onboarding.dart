import 'package:flutter/material.dart';

/// Onboarding compartilhado entre Android, iOS e Web, sem alterar os fluxos
/// nativos de corrida. Permissões opcionais não bloqueiam o acesso ao perfil.
class RamoPermissionOnboardingGate extends StatefulWidget {
  const RamoPermissionOnboardingGate({
    super.key,
    required this.role,
    required this.web,
    required this.readCompleted,
    required this.saveCompleted,
    required this.requestLocation,
    required this.requestNotifications,
    required this.child,
  });

  final String role;
  final bool web;
  final Future<bool> Function() readCompleted;
  final Future<void> Function() saveCompleted;
  final Future<bool> Function() requestLocation;
  final Future<bool> Function() requestNotifications;
  final Widget child;

  @override
  State<RamoPermissionOnboardingGate> createState() =>
      _RamoPermissionOnboardingGateState();
}

class _RamoPermissionOnboardingGateState
    extends State<RamoPermissionOnboardingGate> {
  bool? _completed;
  bool _saving = false;
  bool _locationBusy = false;
  bool _notificationBusy = false;
  bool? _locationAllowed;
  bool? _notificationAllowed;
  bool _installationHelp = false;
  bool _allNotifications = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    bool done = false;
    try {
      done = await widget.readCompleted();
    } catch (_) {
      // A falta de storage não impede o usuário de configurar o app.
    }
    if (mounted) setState(() => _completed = done);
  }

  Future<void> _location() async {
    if (_locationBusy) return;
    setState(() => _locationBusy = true);
    bool allowed = false;
    try {
      allowed = await widget.requestLocation();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _locationBusy = false;
      _locationAllowed = allowed;
    });
  }

  Future<void> _notifications() async {
    if (_notificationBusy) return;
    setState(() => _notificationBusy = true);
    bool allowed = false;
    try {
      allowed = await widget.requestNotifications();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _notificationBusy = false;
      _notificationAllowed = allowed;
    });
  }

  Future<void> _finish() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await widget.saveCompleted();
    } catch (_) {
      // Falha local de escrita não deve prender o usuário no onboarding.
    }
    if (mounted) setState(() { _saving = false; _completed = true; });
  }

  Widget _permissionCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required String action,
    required VoidCallback onPressed,
    bool busy = false,
    bool? granted,
  }) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: const Color(0xFF1C1D1F),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Row(
      children: [
        Container(
          height: 46, width: 46,
          decoration: BoxDecoration(
            color: const Color(0xFF303033),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: const Color(0xFFFFCC00)),
        ),
        const SizedBox(width: 13),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFFA5A5A5), height: 1.4)),
            if (granted == false) ...[
              const SizedBox(height: 5),
              const Text('Não autorizado. Você pode tentar novamente ou ajustar nas configurações do aparelho.',
                style: TextStyle(fontSize: 11, color: Color(0xFFFFC46E))),
            ],
          ],
        )),
        const SizedBox(width: 8),
        if (granted == true)
          const Icon(Icons.check_circle_rounded, color: Color(0xFFFFCC00))
        else
          TextButton(
            onPressed: busy ? null : onPressed,
            child: busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(action, style: const TextStyle(color: Color(0xFFFFCC00), fontWeight: FontWeight.w700)),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    if (_completed == null) {
      return const Scaffold(backgroundColor: Color(0xFF101010),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFFFCC00))));
    }
    if (_completed!) return widget.child;

    final driver = widget.role == 'driver';
    return Scaffold(
      backgroundColor: const Color(0xFF101010),
      body: SafeArea(
        child: Center(child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('RAMO NESSA', textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFFFFCC00), fontSize: 13,
                    fontWeight: FontWeight.w900, letterSpacing: 2)),
                const SizedBox(height: 40),
                const Icon(Icons.notifications_active_rounded, size: 66, color: Color(0xFFFFCC00)),
                const SizedBox(height: 24),
                Text(driver ? 'Não perca nenhuma corrida' : 'Tudo pronto para ir nessa?',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 27,
                    fontWeight: FontWeight.w800, height: 1.16)),
                const SizedBox(height: 14),
                Text(
                  driver
                      ? 'Configure os recursos essenciais para receber solicitações e compartilhar sua localização durante o trabalho.'
                      : 'Ative os recursos para encontrar o melhor caminho e acompanhar suas corridas.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFAAAAAA), height: 1.5, fontSize: 14),
                ),
                const SizedBox(height: 32),
                _permissionCard(
                  icon: Icons.location_on_rounded,
                  title: 'Localização',
                  subtitle: driver
                      ? 'Necessária para ficar online e receber corridas. Na Web, mantenha o app aberto.'
                      : 'Encontre seu embarque automaticamente. Você também pode digitar o local.',
                  action: 'Ativar',
                  busy: _locationBusy,
                  granted: _locationAllowed,
                  onPressed: _location,
                ),
                const SizedBox(height: 12),
                _permissionCard(
                  icon: Icons.notifications_rounded,
                  title: 'Notificações',
                  subtitle: widget.web
                      ? 'Na Web, os avisos dependem da instalação e da configuração Web Push.'
                      : 'Receba atualizações de corridas, mensagens e pagamentos.',
                  action: 'Ativar',
                  busy: _notificationBusy,
                  granted: _notificationAllowed,
                  onPressed: _notifications,
                ),
                const SizedBox(height: 18),
                SwitchListTile.adaptive(
                  title: const Text('Todas as notificações', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  subtitle: Text(_allNotifications ? 'Inclui novidades e promoções autorizadas.' : 'Somente avisos importantes e operacionais.',
                    style: const TextStyle(color: Color(0xFFA5A5A5), fontSize: 12)),
                  value: _allNotifications,
                  activeTrackColor: const Color(0xFFFFCC00),
                  onChanged: (value) => setState(() => _allNotifications = value),
                ),
                if (widget.web) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1C1D1F),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Adicionar à Tela de Início',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      const Text('No iPhone, abra pelo Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.',
                        style: TextStyle(color: Color(0xFFA5A5A5), height: 1.4, fontSize: 13)),
                      TextButton.icon(
                        onPressed: () => setState(() => _installationHelp = !_installationHelp),
                        icon: const Icon(Icons.add_to_home_screen_rounded),
                        label: const Text('Como instalar'),
                        style: TextButton.styleFrom(foregroundColor: const Color(0xFFFFCC00)),
                      ),
                      if (_installationHelp)
                        const Text('Safari → botão Compartilhar → Adicionar à Tela de Início → Adicionar. Depois abra pelo novo ícone. Em outros navegadores, procure Instalar aplicativo no menu.',
                          style: TextStyle(color: Colors.white, fontSize: 13, height: 1.5)),
                    ]),
                  ),
                ],
                const SizedBox(height: 30),
                FilledButton(
                  onPressed: _saving ? null : _finish,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFFCC00),
                    foregroundColor: const Color(0xFF111111),
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: const StadiumBorder(),
                  ),
                  child: Text(_saving ? 'Salvando...' : 'Continuar para o Ramo Nessa',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                const SizedBox(height: 12),
                Text(
                  driver
                      ? 'Você pode acessar seu perfil sem autorizar recursos opcionais. Para ficar online, a localização será exigida.'
                      : 'É possível escolher o local de embarque manualmente se você não autorizar a localização.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF888888), fontSize: 12, height: 1.4),
                ),
              ],
            ),
          ),
        )),
      ),
    );
  }
}
