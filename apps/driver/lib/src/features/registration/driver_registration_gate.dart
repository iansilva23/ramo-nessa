import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import '../home/data/driver_api.dart';
import '../profile/presentation/driver_documents_screen.dart';
import 'driver_registration_service.dart';

class DriverRegistrationGate extends StatefulWidget {
  const DriverRegistrationGate({super.key, required this.service, required this.api,
    required this.homeBuilder, required this.logout});
  final DriverRegistrationService service;
  final DriverApi api;
  final Widget Function() homeBuilder;
  final Future<bool> Function() logout;
  @override
  State<DriverRegistrationGate> createState() => _DriverRegistrationGateState();
}

class _DriverRegistrationGateState extends State<DriverRegistrationGate> {
  Map<String, dynamic>? _status;
  bool _loading = true;
  String? _error;
  int _step = 0;
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _plate = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController();
  final _color = TextEditingController();
  final _seats = TextEditingController();
  String _category = 'moto';
  bool _fourByFour = false;

  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() {
    for (final controller in [_name, _plate, _make, _model, _year, _color, _seats]) { controller.dispose(); }
    super.dispose();
  }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await widget.service.status();
      if (mounted) setState(() { _status = status; _loading = false; });
    } catch (error) {
      if (mounted) setState(() { _loading = false; _error = error.toString(); });
    }
  }
  Future<void> _submit() async {
    if (_loading || !(_form.currentState?.validate() ?? false)) return;
    setState(() { _loading = true; _error = null; });
    try {
      final status = await widget.service.submit({
        'fullName': _name.text.trim(),
        'vehicle': {'plate': _plate.text.trim(), 'make': _make.text.trim(), 'model': _model.text.trim(),
          'modelYear': int.parse(_year.text), 'color': _color.text.trim(), 'categories': [_category],
          'fourByFour': _fourByFour, 'seatCapacity': int.parse(_seats.text)},
      });
      if (mounted) setState(() { _status = status; _loading = false; });
    } catch (error) { if (mounted) setState(() { _loading = false; _error = error.toString(); }); }
  }
  Widget _field(String label, TextEditingController controller, {bool number = false, int min = 1, int max = 120, String? Function(String)? check}) {
    return Padding(padding: const EdgeInsets.only(bottom: 16), child: TextFormField(
      controller: controller, enabled: !_loading, maxLength: max,
      keyboardType: number ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.length < min) return 'Preencha $label.';
        return check?.call(text);
      },
    ));
  }
  Future<void> _documents() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DriverDocumentsScreen(api: widget.api)));
    if (mounted) await _load();
  }
  Future<void> _logout() async {
    final success = await widget.logout();
    if (mounted && !success) setState(() => _error = 'Não foi possível sair agora. Tente novamente.');
  }

  @override
  Widget build(BuildContext context) {
    if (_status?['status'] == 'approved' && !_loading && _error == null) return widget.homeBuilder();
    final incomplete = _status?['status'] == 'incomplete';
    return Scaffold(
      appBar: AppBar(title: const Text('Cadastro de motorista'), actions: [TextButton(onPressed: _loading ? null : _logout, child: const Text('Sair'))]),
      body: SafeArea(child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const RamoBrandLockup(), const SizedBox(height: 28),
          if (_loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          if (_error != null) ...[
            Text(_error!, key: const Key('registration-error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 12),
            if (_status == null) FilledButton(onPressed: _loading ? null : _load, child: const Text('Tentar novamente')),
          ],
          if (incomplete) ..._formContent(context)
          else if (_status != null) ..._statusContent(context),
        ]),
      ))),
    );
  }

  List<Widget> _formContent(BuildContext context) => [
    Text(_step == 0 ? 'Vamos conhecer você' : 'Seu veículo', style: Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height: 8),
    Text(_step == 0 ? 'WhatsApp validado. Agora preencha seus dados.' : 'Informe o veículo que será analisado pela equipe.'),
    const SizedBox(height: 16),
    LinearProgressIndicator(value: _step == 0 ? 1 / 3 : 2 / 3), const SizedBox(height: 24),
    Form(key: _form, child: Column(children: [
      if (_step == 0) _field('Nome completo', _name, min: 3)
      else ...[
        DropdownButtonFormField<String>(initialValue: _category, decoration: const InputDecoration(labelText: 'Categoria desejada'),
          items: const [DropdownMenuItem(value: 'moto', child: Text('Mototáxi')), DropdownMenuItem(value: 'car', child: Text('Carro popular')),
            DropdownMenuItem(value: 'delivery', child: Text('Entregas')), DropdownMenuItem(value: 'comfort_black', child: Text('4x4 Comfort / Black')),
            DropdownMenuItem(value: 'buggy', child: Text('Buggy'))],
          onChanged: _loading ? null : (value) => setState(() { _category = value!; if (_category == 'comfort_black') _fourByFour = true; })),
        const SizedBox(height: 16),
        _field('Placa', _plate, max: 8, check: (value) => RegExp(r'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$').hasMatch(value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '')) ? null : 'Informe uma placa brasileira válida.'),
        _field('Marca', _make, min: 2, max: 60), _field('Modelo', _model, max: 80),
        _field('Ano do modelo', _year, number: true, max: 4, check: (value) { final year = int.tryParse(value); return year != null && year >= 1980 && year <= 2100 ? null : 'Informe um ano válido.'; }),
        _field('Cor', _color, min: 2, max: 40),
        _field('Capacidade de pessoas', _seats, number: true, max: 2, check: (value) { final seats = int.tryParse(value); return seats != null && seats >= 1 && seats <= 12 ? null : 'Informe de 1 a 12 pessoas.'; }),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Veículo 4x4'), value: _fourByFour,
          onChanged: _loading || _category == 'comfort_black' ? null : (value) => setState(() => _fourByFour = value)),
        const Text('Após salvar, envie sua CNH e o documento do veículo. A equipe verifica e aprova o cadastro antes de liberar corridas.'),
      ],
      const SizedBox(height: 20),
      SizedBox(width: double.infinity, child: FilledButton(
        key: const Key('registration-continue'), onPressed: _loading ? null : () {
          if (_step == 0) { if (_form.currentState!.validate()) setState(() => _step = 1); }
          else { _submit(); }
        }, child: Text(_step == 0 ? 'Continuar para o veículo' : 'Salvar e enviar documentos'))),
      if (_step == 1) TextButton(onPressed: _loading ? null : () => setState(() => _step = 0), child: const Text('Voltar aos meus dados')),
    ])),
  ];

  List<Widget> _statusContent(BuildContext context) {
    final suspended = _status!['status'] == 'suspended';
    final submitted = _status!['documentsSubmitted'] == true;
    final documents = (_status!['documents'] as List? ?? []).whereType<Map>();
    final needsCorrection = documents.any((document) => document['status'] == 'rejected' || document['status'] == 'expired');
    return [
      Icon(suspended ? Icons.info_outline : submitted ? Icons.hourglass_top_rounded : Icons.description_outlined, size: 52),
      const SizedBox(height: 20),
      Text(suspended ? 'Cadastro indisponível' : needsCorrection ? 'Corrija seus documentos' : submitted ? 'Seu cadastro está em análise' : 'Falta enviar os documentos',
        textAlign: TextAlign.center, key: const Key('registration-status'), style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 12),
      Text(suspended ? 'Procure a equipe Ramo Nessa para entender a situação do seu cadastro.'
        : needsCorrection ? 'Confira o motivo abaixo e envie novamente os documentos que precisam de correção.' : submitted ? 'Você já enviou os dados e documentos. As corridas serão liberadas após a aprovação da equipe.'
        : 'Envie sua CNH e o CRLV para a equipe analisar seu cadastro.', textAlign: TextAlign.center),
      const SizedBox(height: 24),
      ...documents.map((document) => ListTile(contentPadding: EdgeInsets.zero,
        title: Text(document['documentType'] == 'driver_license' ? 'CNH' : 'Documento do veículo'),
        subtitle: Text(document['status'] == 'approved' ? 'Aprovado' : document['status'] == 'rejected'
          ? 'Correção necessária: ${document['reviewReason'] ?? 'envie novamente'}' : document['status'] == 'expired' ? 'Documento vencido' : 'Em análise'))),
      if (!suspended) FilledButton(onPressed: _loading ? null : _documents, child: const Text('Enviar / conferir documentos')),
      const SizedBox(height: 12),
      OutlinedButton(onPressed: _loading ? null : _load, child: const Text('Atualizar situação')),
    ];
  }
}
