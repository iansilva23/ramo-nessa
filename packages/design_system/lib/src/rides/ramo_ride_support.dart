import 'package:flutter/material.dart';

import 'ramo_ride_activity.dart';

abstract interface class RamoRideSupportApi {
  Future<List<Map<String, dynamic>>> rideSupportTickets(String rideId);
  Future<void> createRideSupportTicket({
    required String rideId,
    required String reason,
    required String description,
  });
}

class RamoRideSupportScreen extends StatefulWidget {
  const RamoRideSupportScreen({
    super.key,
    required this.api,
    required this.ride,
    this.driver = false,
  });
  final RamoRideSupportApi api;
  final RamoRideActivityData ride;
  final bool driver;
  @override
  State<RamoRideSupportScreen> createState() => _RamoRideSupportScreenState();
}

class _RamoRideSupportScreenState extends State<RamoRideSupportScreen> {
  final _description = TextEditingController();
  String? _reason, _error;
  bool _sending = false, _loading = true;
  List<Map<String, dynamic>> _tickets = [];
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final tickets = await widget.api.rideSupportTickets(widget.ride.id);
      if (mounted) {
        setState(() {
          _tickets = tickets;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error =
              'Não conseguimos consultar os atendimentos. Tente novamente.';
        });
      }
    }
  }

  Future<void> _send() async {
    if (_sending) return;
    if (_reason == null) {
      setState(() => _error = 'Selecione o motivo do pedido.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.createRideSupportTicket(
        rideId: widget.ride.id,
        reason: _reason!,
        description: _description.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _sending = false;
        _reason = null;
        _description.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pedido enviado à moderação e vinculado à corrida.'),
        ),
      );
      await _load();
    } catch (_) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error =
              'Não conseguimos confirmar o envio. Atualize os atendimentos antes de tentar novamente.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final reasons = widget.driver
        ? [
            'Não encontrei o passageiro',
            'Passageiro não responde',
            'Problema com pagamento ou repasse',
            'Conduta inadequada ou outro problema',
          ]
        : [
            'Motorista não está no embarque',
            'Motorista parou de responder',
            'Problema com o pagamento',
            'Conduta inadequada ou outro problema',
          ];
    return Scaffold(
      appBar: AppBar(title: const Text('Ajuda com a corrida')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Text(
              'O que aconteceu?',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            const Text('Seu relato fica vinculado a esta corrida.'),
            const SizedBox(height: 20),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.receipt_long_outlined),
              title: Text('Corrida #${widget.ride.reference}'),
              subtitle: Text(
                '${widget.ride.statusLabel} · ${widget.ride.paymentLabel}\n${widget.ride.amount}',
              ),
            ),
            const Divider(height: 32),
            RadioGroup<String>(
                groupValue: _reason,
                onChanged: (value) {
                  if (!_sending) setState(() => _reason = value);
                },
                child: Column(
                    children: reasons
                        .map(
                          (reason) => RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            title: Text(reason,
                                style: const TextStyle(fontSize: 14)),
                            value: reason,
                            enabled: !_sending,
                          ),
                        )
                        .toList())),
            const SizedBox(height: 16),
            TextField(
              controller: _description,
              enabled: !_sending,
              maxLines: 3,
              maxLength: 1700,
              decoration: const InputDecoration(
                labelText: 'Conte mais (opcional)',
                hintText: 'Descreva o que aconteceu...',
              ),
            ),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text(
                'O que acompanha seu pedido',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              children: const [
                Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text(
                    'Identificação da corrida e dos participantes, veículo, pagamento e etapas registradas. Localizações incluem o horário da observação, quando disponíveis. A chegada informada ou um ponto de GPS, sozinhos, não comprovam presença física.',
                  ),
                ),
              ],
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            FilledButton.icon(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.arrow_forward),
              label: Text(_sending ? 'Enviando…' : 'Enviar para moderação'),
            ),
            const SizedBox(height: 30),
            Text(
              'Atendimentos desta corrida',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (_loading)
              const LinearProgressIndicator()
            else if (_tickets.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('Nenhum atendimento carregado.'),
              ),
            ..._tickets.map(
              (t) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(t['subject']?.toString() ?? 'Atendimento'),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(switch (t['status']) {
                      'resolved' => 'Resolvido',
                      'closed' => 'Fechado',
                      'in_progress' => 'Em atendimento',
                      _ => 'Aberto',
                    }),
                    Text(t['message']?.toString() ?? ''),
                    if (t['response'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('Moderação: ${t['response']}'),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
