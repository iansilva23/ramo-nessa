import 'package:flutter/material.dart';

/// Web-only setup. Native permission screens remain in their existing gate.
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
  Map<String, Object?> _state = {};
  bool? _completed;
  bool _busy = false, _help = false, _all = false;
  int _step = 0, _revision = 0;
  String? _notice;
  bool get _ios => _state['ios'] == true;
  bool get _standalone => _state['standalone'] == true;
  bool get _installed => _state['installed'] == true;
  String get _location => _state['location'] as String? ?? 'unknown';
  String get _notification => _state['notification'] as String? ?? 'unsupported';

  @override
  void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); _load(); }
  @override
  void dispose() { WidgetsBinding.instance.removeObserver(this); super.dispose(); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_busy) _refresh();
  }
  Future<void> _load() async {
    bool completed = false, all = false;
    try { completed = await widget.readCompleted().timeout(const Duration(seconds: 3)); } catch (_) {}
    try { all = await widget.readNotificationPreference?.call().timeout(const Duration(seconds: 3)) ?? false; } catch (_) {}
    if (!completed) {
      await _refresh();
    }
    if (!mounted) return;
    setState(() { _completed = completed; _all = all; if (!completed && _installed) _step = 1; });
  }
  Future<void> _refresh() async {
    final revision = ++_revision;
    try {
      final snapshot = await widget.readSnapshot().timeout(const Duration(seconds: 3));
      if (mounted && revision == _revision) setState(() => _state = snapshot);
    } catch (_) {
      if (mounted && revision == _revision) setState(() => _notice = 'Não foi possível conferir agora. Tente novamente.');
    }
  }
  void _next() { if (!_busy) setState(() { _step++; _help = false; _notice = null; }); }
  Future<void> _install() async {
    if (_busy) return;
    setState(() { _busy = true; _notice = null; });
    String result = 'manual';
    try { result = await widget.install().timeout(const Duration(seconds: 30)); } catch (_) {}
    if (!mounted) return;
    await _refresh();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _help = result == 'manual';
      _notice = switch (result) {
        'accepted' || 'installed' => 'Abra o Ramo Nessa pelo ícone na Tela de Início para continuar.',
        'dismissed' => 'A instalação foi cancelada. Você pode continuar no navegador.',
        _ => null,
      };
    });
  }
  Future<void> _requestLocation() async {
    if (_busy) return;
    ++_revision;
    setState(() { _busy = true; _notice = null; });
    String result = 'error';
    // Invoke directly on the tap, without awaiting a permissions query first.
    try { result = await widget.requestLocation().timeout(const Duration(seconds: 16)); }
    catch (_) { result = 'timeout'; }
    if (!mounted) return;
    setState(() { _busy = false; _state = {..._state, 'location': result}; });
  }
  Future<void> _requestNotifications() async {
    if (_busy || !['prompt', 'granted', 'ready'].contains(_notification)) return;
    ++_revision;
    setState(() { _busy = true; _notice = null; });
    bool registered = false;
    // Keep this first async action attached to the user's tap.
    try { registered = await widget.requestNotifications().timeout(const Duration(seconds: 35)); } catch (_) {}
    if (!mounted) return;
    await _refresh();
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (registered) _state = {..._state, 'notification': 'ready'};
      else if (_notification == 'granted') _notice = 'A permissão foi concedida, mas o cadastro dos avisos não terminou. Confira sua conexão e tente novamente.';
      else if (_notification == 'prompt') _notice = 'O pedido não foi confirmado. Toque novamente quando quiser permitir os avisos.';
      else if (_notification == 'ready') _notice = 'O cadastro não foi confirmado. Confira sua conexão e tente novamente.';
    });
  }
  Future<void> _finish() async {
    if (_busy) return;
    setState(() { _busy = true; _notice = null; });
    bool synced = true;
    try { await widget.saveNotificationPreference(_all).timeout(const Duration(seconds: 12)); } catch (_) { synced = false; }
    try { await widget.saveCompleted().timeout(const Duration(seconds: 4)); }
    catch (_) {
      if (mounted) setState(() { _busy = false; _notice = 'Não conseguimos salvar esta etapa. Tente concluir novamente.'; });
      return;
    }
    if (!mounted) return;
    setState(() { _busy = false; _completed = true; });
    if (!synced) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('A preferência dos avisos está pendente de confirmação. Confira Notificações no perfil.')));
  }
  String get _locationHelp => switch (_location) {
    'granted' => 'Localização permitida neste navegador.',
    'denied' => 'A localização foi bloqueada. Libere a permissão nas configurações deste site e tente novamente.',
    'timeout' => 'O GPS demorou a responder. Vá para um local com melhor sinal e tente novamente.',
    'unavailable' => 'Sua posição está indisponível. Confira se a localização do aparelho está ligada e tente novamente.',
    'unsupported' => 'Este navegador não oferece localização. Abra o link no Safari ou Chrome atualizado.',
    'insecure' => 'A localização exige uma conexão HTTPS segura. Reabra o link oficial do app.',
    'error' => 'Não conseguimos obter sua posição agora. Confira o navegador e tente novamente.',
    _ => widget.role == 'driver' ? 'Permita sua localização para ficar online. Na versão web, mantenha o app aberto durante o trabalho.' : 'Permita sua localização para encontrar o embarque. Você também pode informar o endereço manualmente.',
  };
  String get _notificationHelp => switch (_notification) {
    'ready' => 'Permissão e cadastro dos avisos confirmados.',
    'install' => 'No iPhone, os avisos só podem ser ativados no app aberto pelo ícone da Tela de Início.',
    'denied' => 'A permissão foi bloqueada. O app não pode liberar esse bloqueio sozinho.',
    'granted' => 'A permissão já está liberada. Falta confirmar o cadastro dos avisos neste app.',
    'prompt' => 'Toque em Ativar notificações e depois em Permitir na mensagem do celular.',
    'unconfigured' || 'configuration-conflict' => 'Não conseguimos preparar os avisos neste ambiente. Você pode continuar e conferir Notificações no perfil.',
    _ => 'Os avisos não estão disponíveis neste navegador. Use um navegador atualizado; no iPhone, abra pelo ícone da Tela de Início.',
  };

  Widget _text(String text, {bool bright = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 14), child: Text(text,
      style: TextStyle(color: bright ? Colors.white : const Color(0xFFB8B8BE), fontSize: 15, height: 1.5)));
  Widget _button(String label, VoidCallback action) => Padding(
    padding: const EdgeInsets.only(top: 8), child: FilledButton(
      onPressed: _busy ? null : action,
      style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFFCC00), foregroundColor: Colors.black,
        minimumSize: const Size.fromHeight(54), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
      child: Text(_busy ? 'Aguarde...' : label, style: const TextStyle(fontWeight: FontWeight.w800))));
  Widget _secondary(String label, VoidCallback action) => TextButton(onPressed: _busy ? null : action,
    style: TextButton.styleFrom(foregroundColor: const Color(0xFFFFCC00)), child: Text(label));
  Widget _instruction(IconData icon, String text) => Padding(padding: const EdgeInsets.only(bottom: 18),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, color: const Color(0xFFFFCC00), size: 28), const SizedBox(width: 14),
      Expanded(child: Text(text, style: const TextStyle(color: Colors.white, height: 1.5))),
    ]));
  List<Widget> _installInstructions() => _ios ? [
    _instruction(Icons.ios_share, '1. No Safari, toque em Compartilhar. O botão pode estar dentro do menu do navegador.'),
    _instruction(Icons.add_box_outlined, '2. Procure Adicionar à Tela de Início. Role as opções se necessário.'),
    _instruction(Icons.add_to_home_screen, '3. Toque em Adicionar. Depois, feche esta aba e abra pelo novo ícone.'),
  ] : [
    _instruction(Icons.more_vert, '1. Abra o menu do navegador.'),
    _instruction(Icons.install_mobile, '2. Escolha Instalar aplicativo ou Adicionar à Tela de Início.'),
    _instruction(Icons.touch_app, '3. Confirme a instalação e abra pelo novo ícone.'),
  ];
  List<Widget> _content() {
    if (_step == 0) return [
      _text('Tenha o Ramo Nessa na Tela de Início, com acesso pelo ícone. No iPhone, esse passo também permite ativar notificações.'),
      if (_state['embedded'] == true) _text('Você está em um navegador dentro de outro aplicativo. Abra este link no Safari ou Chrome para configurar os recursos.', bright: true),
      if (_installed) _text('Instalação reconhecida. Abra pelo ícone para a melhor experiência.', bright: true),
      if (_ios || _help) ..._installInstructions(),
      if (!_ios && !_installed) _button(_state['installAvailable'] == true ? 'Instalar aplicativo' : 'Ver como instalar', _install),
      if (_ios) _secondary('Já adicionei: conferir novamente', _refresh),
      _secondary(_installed ? 'Continuar' : 'Continuar no navegador por enquanto', _next),
    ];
    if (_step == 1) return [
      _text(_locationHelp, bright: _location == 'granted'),
      if (_location == 'denied' || _help) ...[
        _text(_ios ? 'No Safari, abra o menu da página → Ajustes do Site → Localização → Permitir. Confira também os Serviços de Localização nos Ajustes do iPhone.' : 'Abra as permissões deste site no menu ou no ícone ao lado do endereço e permita Localização. Confira também se o GPS do aparelho está ligado.'),
      ],
      if (_location == 'granted') _button('Continuar', _next)
      else ...[
        if (!['unsupported','insecure'].contains(_location)) _button(_location == 'unknown' ? 'Ativar localização' : 'Tentar localização novamente', _requestLocation),
        _secondary('Como liberar a localização', () => setState(() => _help = !_help)),
        _secondary(widget.role == 'driver' ? 'Configurar depois; acessar meu perfil' : 'Usar endereço manual por enquanto', _next),
      ],
    ];
    if (_step == 2) return [
      _text(_notificationHelp, bright: _notification == 'ready'),
      if (_state['online'] == false) _text('Você está sem conexão. Reconecte para cadastrar os avisos.'),
      if (_notification == 'denied') _text(_ios ? 'Abra Ajustes → Notificações → Ramo Nessa e permita os avisos. Volte ao app e toque em Verificar novamente.' : 'Nas permissões deste site, permita Notificações. Depois volte e toque em Verificar novamente.'),
      if (_notification == 'install') ..._installInstructions(),
      if (_notification == 'ready') _button('Continuar', _next)
      else ...[
        if (['prompt', 'granted'].contains(_notification)) _button(_notification == 'granted' ? 'Concluir ativação dos avisos' : 'Ativar notificações', _requestNotifications),
        _secondary('Verificar novamente', _refresh),
        _secondary('Continuar sem notificações por enquanto', _next),
      ],
      SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _all,
        onChanged: _busy ? null : (value) => setState(() => _all = value),
        title: const Text('Receber também novidades e promoções', style: TextStyle(color: Colors.white, fontSize: 14)),
        subtitle: const Text('Desligado: somente avisos importantes e operacionais.', style: TextStyle(color: Color(0xFFB8B8BE), fontSize: 12))),
    ];
    return [
      _text('Confira o que ficou pronto. Você pode ajustar os recursos depois no perfil.'),
      _instruction(_standalone ? Icons.check_circle : Icons.info_outline,
        _standalone ? 'Aberto pela Tela de Início' : _installed ? 'Instalação reconhecida; esta aba continua no navegador' : 'Usando pelo navegador'),
      _instruction(_location == 'granted' ? Icons.check_circle : Icons.info_outline,
        _location == 'granted' ? 'Localização permitida' : 'Localização não confirmada'),
      _instruction(_notification == 'ready' ? Icons.check_circle : Icons.info_outline,
        _notification == 'ready' ? 'Notificações ativadas' : 'Notificações não ativadas'),
      if (widget.role == 'driver') _text('Para ficar online e receber corridas, a localização será exigida. Na web, mantenha o app aberto.'),
      _button('Entrar no Ramo Nessa', _finish),
    ];
  }
  @override
  Widget build(BuildContext context) {
    if (_completed == true) return widget.child;
    if (_completed == null) return const Scaffold(backgroundColor: Color(0xFF101010), body: Center(child: CircularProgressIndicator()));
    final titles = ['Adicione à Tela de Início', 'Ative sua localização', 'Ative os avisos', 'Seu app, do seu jeito'];
    final icons = [Icons.add_to_home_screen, Icons.location_on_outlined, Icons.notifications_outlined, Icons.task_alt];
    return Scaffold(backgroundColor: const Color(0xFF101010), body: SafeArea(child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480), child: SingleChildScrollView(padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('RAMO NESSA', style: TextStyle(color: Color(0xFFFFCC00), fontWeight: FontWeight.w900, letterSpacing: 2)),
          const SizedBox(height: 24),
          Text(_step < 3 ? 'PASSO ${_step + 1} DE 3' : 'RESUMO DA CONFIGURAÇÃO', style: const TextStyle(color: Color(0xFFB8B8BE), fontSize: 12)),
          const SizedBox(height: 12), LinearProgressIndicator(value: (_step + 1) / 4, color: const Color(0xFFFFCC00), backgroundColor: const Color(0xFF303033)),
          const SizedBox(height: 28), Icon(icons[_step], color: const Color(0xFFFFCC00), size: 56),
          const SizedBox(height: 24), Text(titles[_step], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28)),
          const SizedBox(height: 20), ..._content(),
          if (_notice != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(_notice!, style: const TextStyle(color: Color(0xFFFFCC80), height: 1.5))),
          if (_busy) const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(color: Color(0xFFFFCC00)))),
          if (_step > 0) _secondary('Voltar', () => setState(() { _step--; _help = false; _notice = null; })),
        ]),
    )))));
  }
}
