import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

class DriverSupportScreen extends StatefulWidget {
  const DriverSupportScreen({
    super.key,
    required this.api,
  });

  final DriverApi api;

  @override
  State<DriverSupportScreen> createState() => _DriverSupportScreenState();
}

class _DriverSupportScreenState extends State<DriverSupportScreen> {
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();

  DriverSupportSnapshot? _snapshot;
  String _category = 'ride';
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final snapshot = await widget.api.supportTickets();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _loading = false;
      });
    } on DriverApiException catch (error) {
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
    if (_submitting) return;
    final subject = _subjectController.text.trim();
    final message = _messageController.text.trim();

    if (subject.length < 3 || message.length < 10) {
      setState(() {
        _error =
            'Informe um assunto e descreva o problema com pelo menos 10 caracteres.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await widget.api.createSupportTicket(
        category: _category,
        subject: subject,
        message: message,
      );
      if (!mounted) return;
      _subjectController.clear();
      _messageController.clear();
      setState(() => _submitting = false);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Chamado enviado ao suporte.'),
          ),
        );
    } on DriverApiException catch (error) {
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

  String _dateLabel(DateTime value) {
    final local = value.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return day +
        '/' +
        month +
        '/' +
        local.year.toString() +
        ' · ' +
        hour +
        ':' +
        minute;
  }

  Color _statusColor(BuildContext context, String status) {
    return switch (status) {
      'resolved' || 'closed' => RamoColors.success,
      'in_progress' => RamoColors.brandYellow,
      _ => Theme.of(context).colorScheme.primary,
    };
  }

  @override
  Widget build(BuildContext context) {
    final tickets = _snapshot?.tickets ?? const <DriverSupportTicket>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Suporte')),
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
            Container(
              padding: const EdgeInsets.all(RamoSpacing.lg),
              decoration: BoxDecoration(
                color: RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(RamoRadius.lg),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Abrir chamado',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
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
                        value: 'document',
                        child: Text('Documentos'),
                      ),
                      DropdownMenuItem(
                        value: 'other',
                        child: Text('Outro'),
                      ),
                    ],
                    onChanged: _submitting
                        ? null
                        : (value) {
                            if (value != null) {
                              setState(() => _category = value);
                            }
                          },
                  ),
                  const SizedBox(height: RamoSpacing.md),
                  TextField(
                    controller: _subjectController,
                    enabled: !_submitting,
                    maxLength: 120,
                    decoration: const InputDecoration(
                      labelText: 'Assunto',
                      hintText: 'Ex.: dúvida sobre uma corrida',
                    ),
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  TextField(
                    controller: _messageController,
                    enabled: !_submitting,
                    minLines: 4,
                    maxLines: 8,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: 'Descreva o problema',
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: RamoSpacing.md),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _submitting ? null : _submit,
                      icon: const Icon(Icons.send_rounded),
                      label: _submitting
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : const Text('Enviar chamado'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: RamoSpacing.xl),
            const Text(
              'Meus chamados',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            if (_loading && _snapshot == null)
              const Padding(
                padding: EdgeInsets.all(RamoSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (tickets.isEmpty)
              Container(
                padding: const EdgeInsets.all(RamoSpacing.xl),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                ),
                child: const Text(
                  'Você ainda não abriu nenhum chamado.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              ...tickets.map(
                (ticket) => Padding(
                  padding: const EdgeInsets.only(
                    bottom: RamoSpacing.md,
                  ),
                  child: Container(
                    padding: const EdgeInsets.all(RamoSpacing.md),
                    decoration: BoxDecoration(
                      color: RamoColors.surfaceRaised,
                      borderRadius:
                          BorderRadius.circular(RamoRadius.md),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                ticket.subject,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: _statusColor(
                                  context,
                                  ticket.status,
                                ).withValues(alpha: .12),
                                borderRadius:
                                    BorderRadius.circular(RamoRadius.pill),
                              ),
                              child: Text(
                                ticket.statusLabel,
                                style: TextStyle(
                                  color: _statusColor(
                                    context,
                                    ticket.status,
                                  ),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          ticket.categoryLabel +
                              ' · ' +
                              _dateLabel(ticket.createdAt),
                          style: const TextStyle(
                            color: RamoColors.muted,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: RamoSpacing.sm),
                        Text(ticket.message),
                        if (ticket.response?.trim().isNotEmpty == true) ...[
                          const SizedBox(height: RamoSpacing.md),
                          Container(
                            width: double.infinity,
                            padding:
                                const EdgeInsets.all(RamoSpacing.md),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius:
                                  BorderRadius.circular(RamoRadius.md),
                            ),
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Resposta do suporte',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(ticket.response!),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
