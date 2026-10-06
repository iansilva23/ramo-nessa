import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../data/passenger_growth_service.dart';
import '../../payments/data/passenger_payment_service.dart';

class PassengerBenefitsScreen extends StatefulWidget {
  const PassengerBenefitsScreen({super.key, required this.service, this.paymentService});
  final PassengerGrowthService service;
  final PassengerPaymentService? paymentService;
  @override
  State<PassengerBenefitsScreen> createState() => _PassengerBenefitsScreenState();
}

class _PassengerBenefitsScreenState extends State<PassengerBenefitsScreen> {
  final _birthday = TextEditingController();
  final _referral = TextEditingController();
  Map<String, dynamic>? _data;
  final Map<String, bool> _channels = {'inapp': false, 'push': false, 'email': false, 'whatsapp': false};
  String _audience = 'unspecified';
  String? _zone;
  String? _error;
  String? _code;
  bool _busy = false;
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _birthday.dispose(); _referral.dispose(); widget.service.close(); super.dispose(); }
  Future<void> _load() async {
    setState(() { _busy = true; _error = null; });
    try {
      final data = await widget.service.load();
      if (!mounted) return;
      final p = data['preference'] as Map<String, dynamic>;
      final channels = p['channels'] as Map<String, dynamic>;
      setState(() {
        _data = data;
        for (final key in _channels.keys) { _channels[key] = channels[key] == true; }
        _audience = p['audience'] as String? ?? 'unspecified';
        _zone = p['zone'] as String?;
        final day = p['birthdayMonthDay'] as String?;
        _birthday.text = day == null ? '' : '${day.substring(3)}/${day.substring(0, 2)}';
      });
    } catch (e) { if (mounted) setState(() => _error = e.toString()); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  void _notice(String text) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text))); }
  Future<void> _action(Future<void> Function() action) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => _error = e.toString()); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  Future<void> _save() => _action(() async {
    String? day;
    final value = _birthday.text.trim();
    if (value.isNotEmpty) {
      if (!RegExp(r'^\d{2}/\d{2}$').hasMatch(value)) throw const PassengerGrowthException('Informe seu aniversário como dia/mês, por exemplo 05/10.');
      final d = int.parse(value.substring(0, 2)), m = int.parse(value.substring(3));
      final test = DateTime(2000, m, d);
      if (test.month != m || test.day != d) throw const PassengerGrowthException('Informe um dia e mês válidos.');
      day = '${value.substring(3)}-${value.substring(0, 2)}';
    }
    await widget.service.savePreferences({'channels': _channels, 'birthdayMonthDay': day, 'audience': _audience, 'zone': _zone});
    _notice('Preferências salvas. Você pode mudar quando quiser.');
  });
  Widget _benefit(Map<String, dynamic> b) {
    final expiry = DateTime.tryParse(b['endsAt'] as String? ?? '');
    final expired = expiry != null && !expiry.isAfter(DateTime.now());
    final used = b['redeemed'] == true;
    final available = !used && !expired && b['enabled'] == true;
    final amount = ((b['valueCents'] as num? ?? 0) / 100).toStringAsFixed(2).replaceAll('.', ',');
    final categories = (b['categories'] as List? ?? []).join(', ');
    final zones = (b['zones'] as List? ?? []).join(', ');
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(b['name'] as String? ?? 'Seu benefício', style: Theme.of(context).textTheme.titleMedium),
      Text('R\$ $amount de desconto'),
      SelectableText(b['code'] as String? ?? ''),
      Text(used ? 'Já utilizado' : expired ? 'Vencido' : available ? 'Disponível' : 'Desativado'),
      if (expiry != null) Text('Válido até ${expiry.day.toString().padLeft(2, '0')}/${expiry.month.toString().padLeft(2, '0')}/${expiry.year}'),
      Text('Uso pessoal, uma vez. ${categories.isEmpty ? 'Categorias disponíveis' : categories}. ${zones.isEmpty ? 'Regiões atendidas' : zones}.'),
      TextButton(onPressed: !available || _busy || widget.paymentService == null ? null : () => _action(() async {
        await widget.paymentService!.savePromotionCode(b['code'] as String);
        _notice('Cupom salvo. Confira sua aplicação e o preço na próxima corrida.');
      }), child: const Text('Usar na próxima corrida')),
    ])));
  }
  @override
  Widget build(BuildContext context) {
    final benefits = (_data?['benefits'] as List? ?? []).whereType<Map<String, dynamic>>().toList();
    final messages = (_data?['messages'] as List? ?? []).whereType<Map<String, dynamic>>().toList();
    return Scaffold(appBar: AppBar(title: const Text('Meus benefícios')), body: RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(20), children: [
      if (_busy) const LinearProgressIndicator(),
      if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
      if (_data == null && !_busy) TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      if (_data != null) ...[
        Text('Presentes e cupons', style: Theme.of(context).textTheme.titleLarge),
        if (benefits.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Seus benefícios pessoais aparecerão aqui quando estiverem disponíveis.')),
        ...benefits.map(_benefit),
        if (messages.isNotEmpty) ...[
          const SizedBox(height: 16), Text('Novidades para você', style: Theme.of(context).textTheme.titleLarge),
          ...messages.map((m) => Card(child: ListTile(title: Text(m['title'] as String? ?? ''), subtitle: Text(m['message'] as String? ?? ''), trailing: m['openedAt'] == null ? const Icon(Icons.mark_email_unread_outlined) : null, onTap: _busy ? null : () => _action(() async {
            await widget.service.markOpened(m['id'] as String);
            if (!mounted) return;
            setState(() => m['openedAt'] = DateTime.now().toIso8601String());
            _notice(m['message'] as String? ?? 'Mensagem registrada como lida.');
          }))),
        ],
        const SizedBox(height: 24), Text('Suas preferências', style: Theme.of(context).textTheme.titleLarge),
        const Text('Escolha onde deseja receber promoções. Avisos sobre suas corridas continuam independentes.'),
        for (final item in const {'inapp': 'Dentro do aplicativo', 'push': 'Notificações no celular', 'email': 'E-mail', 'whatsapp': 'WhatsApp'}.entries)
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(item.value), value: _channels[item.key]!, onChanged: _busy ? null : (v) => setState(() => _channels[item.key] = v)),
        TextField(controller: _birthday, enabled: !_busy, maxLength: 5, keyboardType: TextInputType.datetime, decoration: const InputDecoration(labelText: 'Aniversário (opcional)', hintText: 'DD/MM', helperText: 'Somente dia e mês. Para apagar, deixe vazio e salve.')),
        DropdownButtonFormField<String>(initialValue: _audience, decoration: const InputDecoration(labelText: 'Seu perfil (opcional)'), items: const [DropdownMenuItem(value: 'unspecified', child: Text('Prefiro não informar')), DropdownMenuItem(value: 'resident', child: Text('Morador')), DropdownMenuItem(value: 'tourist', child: Text('Turista'))], onChanged: _busy ? null : (v) => setState(() => _audience = v ?? 'unspecified')),
        DropdownButtonFormField<String>(initialValue: _zone ?? '', decoration: const InputDecoration(labelText: 'Região de interesse (opcional)'), items: const [DropdownMenuItem(value: '', child: Text('Prefiro não informar')), DropdownMenuItem(value: 'prea', child: Text('Preá')), DropdownMenuItem(value: 'jijoca', child: Text('Jijoca')), DropdownMenuItem(value: 'jericoacoara', child: Text('Jericoacoara')), DropdownMenuItem(value: 'external', child: Text('Outra região'))], onChanged: _busy ? null : (v) => setState(() => _zone = v == '' ? null : v)),
        const SizedBox(height: 16), FilledButton(onPressed: _busy ? null : _save, child: const Text('Salvar preferências')),
        const SizedBox(height: 24), Text('Indique amigos', style: Theme.of(context).textTheme.titleLarge),
        const Text('Benefícios dependem de uma campanha ativa e das condições. A indicação é validada após a primeira corrida paga e concluída.'),
        if (_code != null) SelectableText(_code!),
        TextButton(onPressed: _busy ? null : () => _action(() async { final code = await widget.service.referralCode(); if (!mounted) return; setState(() => _code = code); await Clipboard.setData(ClipboardData(text: code)); _notice('Seu código foi copiado.'); }), child: const Text('Copiar meu código')),
        TextField(controller: _referral, enabled: !_busy, maxLength: 18, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Código de quem indicou você', helperText: 'Registre antes de concluir sua primeira corrida.')),
        TextButton(onPressed: _busy ? null : () => _action(() async { await widget.service.applyReferral(_referral.text); _notice('Indicação registrada.'); }), child: const Text('Registrar indicação')),
      ],
    ])));
  }
}
