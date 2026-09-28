import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/passenger_support_service.dart';

class PassengerSupportScreen extends StatefulWidget {
  const PassengerSupportScreen({super.key, required this.service});

  final PassengerSupportService service;

  @override
  State<PassengerSupportScreen> createState() =>
      _PassengerSupportScreenState();
}

class _PassengerSupportScreenState extends State<PassengerSupportScreen> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  List<PassengerSupportTicket> _tickets = const [];
  String _category = 'ride';
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final tickets = await widget.service.listTickets();
      if (!mounted) return;
      setState(() {
        _tickets = tickets;
        _loading = false;
      });
    } on PassengerSupportException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar seus chamados agora.';
      });
    }
  }

  Future<void> _submit() async {
    final subject = _subject.text.trim();
    final message = _message.text.trim();
    if (_submitting) return;
    if (subject.length < 3 || message.length < 10) {
      setState(() {
        _error =
            'Informe um assunto e uma mensagem com pelo menos 10 caracteres.';
      });
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.service.createTicket(
        category: _category,
        subject: subject,
        message: message,
      );
      _subject.clear();
      _message.clear();
      if (!mounted) return;
      setState(() => _submitting = false);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chamado enviado ao suporte.')),
      );
    } on PassengerSupportException catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Não conseguimos enviar o chamado agora.';
      });
    }
  }

  String _status(String value) => switch (value) {
        'in_progress' => 'Em atendimento',
        'resolved' => 'Resolvido',
        'closed' => 'Fechado',
        _ => 'Aberto',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Falar com o suporte')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Abrir chamado',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: RamoSpacing.md),
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(
                        labelText: 'Categoria',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'ride',
                          child: Text('Corrida'),
                        ),
                        DropdownMenuItem(
                          value: 'payment',
                          child: Text('Pagamento'),
                        ),
                        DropdownMenuItem(
                          value: 'account',
                          child: Text('Conta'),
                        ),
                        DropdownMenuItem(
                          value: 'other',
                          child: Text('Outro'),
                        ),
                      ],
                      onChanged: _submitting
                          ? null
                          : (value) => setState(
                                () => _category = value ?? _category,
                              ),
                    ),
                    const SizedBox(height: RamoSpacing.md),
                    TextField(
                      key: const Key('passenger-support-subject'),
                      controller: _subject,
                      enabled: !_submitting,
                      maxLength: 120,
                      decoration: const InputDecoration(labelText: 'Assunto'),
                    ),
                    TextField(
                      key: const Key('passenger-support-message'),
                      controller: _message,
                      enabled: !_submitting,
                      minLines: 4,
                      maxLines: 8,
                      maxLength: 2000,
                      decoration: const InputDecoration(
                        labelText: 'Descreva o que aconteceu',
                      ),
                    ),
                    if (_error != null)
                      Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    const SizedBox(height: RamoSpacing.sm),
                    FilledButton.icon(
                      key: const Key('passenger-support-submit'),
                      onPressed: _submitting ? null : _submit,
                      icon: const Icon(Icons.send_rounded),
                      label: Text(
                        _submitting ? 'Enviando…' : 'Enviar chamado',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'Meus chamados',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: RamoSpacing.md),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_tickets.isEmpty)
              const Text('Você ainda não abriu nenhum chamado.')
            else
              ..._tickets.map(
                (ticket) => Card(
                  child: ListTile(
                    title: Text(ticket.subject),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${_status(ticket.status)} · ${ticket.message}'),
                        if (ticket.response != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Resposta do suporte: ${ticket.response}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                    isThreeLine: ticket.response != null,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
