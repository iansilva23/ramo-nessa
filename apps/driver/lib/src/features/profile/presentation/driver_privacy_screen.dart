import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/driver_privacy_service.dart';

class DriverPrivacyScreen extends StatefulWidget {
  const DriverPrivacyScreen({
    super.key,
    required this.service,
  });

  final DriverPrivacyService? service;

  @override
  State<DriverPrivacyScreen> createState() =>
      _DriverPrivacyScreenState();
}

class _DriverPrivacyScreenState extends State<DriverPrivacyScreen> {
  final TextEditingController _note = TextEditingController();

  DriverPrivacyOverview? _overview;
  bool _loading = true;
  bool _savingPreference = false;
  bool _sendingRequest = false;
  String _requestType = 'access';
  String? _error;

  static const _requestTypes = <String, String>{
    'access': 'Acesso aos meus dados',
    'correction': 'Correção de dados',
    'deletion': 'Eliminação de dados',
    'anonymization': 'Anonimização',
    'portability': 'Portabilidade',
    'consent_revocation': 'Revogação de consentimento',
  };

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final service = widget.service;
    if (service == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Privacidade indisponível neste modo.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final overview = await service.overview();
      if (!mounted) return;
      setState(() {
        _overview = overview;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _accept(DriverLegalDocument document) async {
    final service = widget.service;
    if (service == null || document.accepted) return;

    try {
      await service.acceptLegalDocument(
        documentType: document.documentType,
        version: document.version,
      );
      if (!mounted) return;
      _showMessage('Aceite registrado para esta versão.');
      await _load();
    } catch (error) {
      if (!mounted) return;
      _showMessage(error.toString(), error: true);
    }
  }

  Future<void> _updateMarketing(bool enabled) async {
    final service = widget.service;
    final overview = _overview;
    if (
      service == null ||
      overview == null ||
      _savingPreference
    ) {
      return;
    }

    setState(() => _savingPreference = true);
    try {
      final preferences =
          await service.updateMarketingNotifications(enabled);
      if (!mounted) return;
      setState(() {
        _overview = DriverPrivacyOverview(
          legalDocuments: overview.legalDocuments,
          preferences: preferences,
          requests: overview.requests,
        );
        _savingPreference = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _savingPreference = false);
      _showMessage(error.toString(), error: true);
    }
  }

  Future<void> _submitRequest() async {
    final service = widget.service;
    if (service == null || _sendingRequest) return;

    setState(() => _sendingRequest = true);
    try {
      await service.createRequest(
        requestType: _requestType,
        note: _note.text,
      );
      if (!mounted) return;
      _note.clear();
      setState(() => _sendingRequest = false);
      _showMessage('Solicitação registrada e enviada para atendimento.');
      await _load();
    } catch (error) {
      if (!mounted) return;
      setState(() => _sendingRequest = false);
      _showMessage(error.toString(), error: true);
    }
  }

  void _showMessage(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor:
              error ? Theme.of(context).colorScheme.error : null,
        ),
      );
  }

  String _date(DateTime value) {
    final local = value.toLocal();
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year}';
  }

  String _statusLabel(String status) {
    return switch (status) {
      'open' => 'Aberta',
      'in_progress' => 'Em atendimento',
      'completed' => 'Concluída',
      'rejected' => 'Rejeitada',
      _ => status,
    };
  }

  @override
  Widget build(BuildContext context) {
    final overview = _overview;

    return Scaffold(
      appBar: AppBar(title: const Text('Privacidade e LGPD')),
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
            Text(
              'Seus dados, suas escolhas',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Consulte os documentos vigentes e exerça seus direitos de privacidade pelo próprio aplicativo.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            if (_loading) ...[
              const SizedBox(height: RamoSpacing.xxl),
              const Center(child: CircularProgressIndicator()),
            ] else if (_error != null && overview == null) ...[
              const SizedBox(height: RamoSpacing.xl),
              _PrivacyNotice(
                icon: Icons.error_outline_rounded,
                text: _error!,
              ),
              const SizedBox(height: RamoSpacing.md),
              OutlinedButton(
                onPressed: widget.service == null ? null : _load,
                child: const Text('Tentar novamente'),
              ),
            ] else if (overview != null) ...[
              const SizedBox(height: RamoSpacing.xl),
              _sectionTitle(context, 'Documentos legais'),
              if (overview.legalDocuments.isEmpty)
                const _PrivacyNotice(
                  icon: Icons.description_outlined,
                  text:
                      'Ainda não há documentos legais publicados pelo administrador.',
                )
              else
                ...overview.legalDocuments.map(
                  (document) => _LegalDocumentCard(
                    document: document,
                    dateLabel: _date(document.effectiveAt),
                    onAccept: document.accepted
                        ? null
                        : () => _accept(document),
                  ),
                ),
              const SizedBox(height: RamoSpacing.xl),
              _sectionTitle(context, 'Preferências'),
              Card(
                margin: EdgeInsets.zero,
                child: SwitchListTile(
                  key: const Key('driver-privacy-marketing-switch'),
                  value: overview
                      .preferences.marketingNotificationsEnabled,
                  onChanged: _savingPreference
                      ? null
                      : _updateMarketing,
                  title: const Text(
                    'Comunicações de marketing',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: const Text(
                    'Você pode mudar esta preferência a qualquer momento. Avisos operacionais essenciais não dependem desta opção.',
                  ),
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
              _sectionTitle(context, 'Exercer um direito'),
              DropdownButtonFormField<String>(
                key: const Key('driver-privacy-request-type'),
                initialValue: _requestType,
                decoration: const InputDecoration(
                  labelText: 'Tipo de solicitação',
                ),
                items: _requestTypes.entries
                    .map(
                      (entry) => DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                    )
                    .toList(growable: false),
                onChanged: _sendingRequest
                    ? null
                    : (value) {
                        if (value != null) {
                          setState(() => _requestType = value);
                        }
                      },
              ),
              const SizedBox(height: RamoSpacing.md),
              TextField(
                key: const Key('driver-privacy-request-note'),
                controller: _note,
                enabled: !_sendingRequest,
                minLines: 3,
                maxLines: 6,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Observação opcional',
                  hintText:
                      'Explique o que você precisa, sem informar senhas ou códigos.',
                ),
              ),
              SizedBox(
                height: 50,
                child: FilledButton(
                  key: const Key('driver-privacy-request-submit'),
                  onPressed:
                      _sendingRequest ? null : _submitRequest,
                  child: _sendingRequest
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Text('Enviar solicitação'),
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
              _sectionTitle(context, 'Minhas solicitações'),
              if (overview.requests.isEmpty)
                const _PrivacyNotice(
                  icon: Icons.inbox_outlined,
                  text: 'Você ainda não enviou solicitações de privacidade.',
                )
              else
                ...overview.requests.map(
                  (request) => _PrivacyRequestCard(
                    request: request,
                    typeLabel: _requestTypes[request.requestType] ??
                        request.requestType,
                    statusLabel: _statusLabel(request.status),
                    createdLabel: _date(request.createdAt),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: RamoSpacing.sm),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
      ),
    );
  }
}

class _LegalDocumentCard extends StatelessWidget {
  const _LegalDocumentCard({
    required this.document,
    required this.dateLabel,
    this.onAccept,
  });

  final DriverLegalDocument document;
  final String dateLabel;
  final VoidCallback? onAccept;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: RamoSpacing.sm),
      child: ExpansionTile(
        title: Text(
          document.title,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          'Versão ${document.version} · vigente desde $dateLabel',
        ),
        trailing: Icon(
          document.accepted
              ? Icons.verified_rounded
              : Icons.chevron_right_rounded,
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              RamoSpacing.md,
              0,
              RamoSpacing.md,
              RamoSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SelectableText(document.content),
                const SizedBox(height: RamoSpacing.md),
                if (document.accepted)
                  const Text(
                    'Versão aceita',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  )
                else
                  FilledButton(
                    key: Key(
                      'driver-privacy-accept-${document.documentType}',
                    ),
                    onPressed: onAccept,
                    child: const Text('Li e aceito esta versão'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrivacyRequestCard extends StatelessWidget {
  const _PrivacyRequestCard({
    required this.request,
    required this.typeLabel,
    required this.statusLabel,
    required this.createdLabel,
  });

  final DriverPrivacyRequest request;
  final String typeLabel;
  final String statusLabel;
  final String createdLabel;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: RamoSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    typeLabel,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Text(statusLabel),
              ],
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Enviada em $createdLabel',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            if (request.note?.trim().isNotEmpty == true) ...[
              const SizedBox(height: RamoSpacing.sm),
              Text(request.note!),
            ],
            if (request.response?.trim().isNotEmpty == true) ...[
              const Divider(height: RamoSpacing.xl),
              const Text(
                'Resposta',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: RamoSpacing.xs),
              Text(request.response!),
            ],
          ],
        ),
      ),
    );
  }
}

class _PrivacyNotice extends StatelessWidget {
  const _PrivacyNotice({
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon),
          const SizedBox(width: RamoSpacing.sm),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
