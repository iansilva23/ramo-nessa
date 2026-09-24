import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

class DriverDocumentsScreen extends StatefulWidget {
  const DriverDocumentsScreen({
    super.key,
    required this.api,
  });

  final DriverApi api;

  @override
  State<DriverDocumentsScreen> createState() => _DriverDocumentsScreenState();
}

class _DriverDocumentsScreenState extends State<DriverDocumentsScreen> {
  DriverDocumentsSnapshot? _snapshot;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final snapshot = await widget.api.documents();
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
        _error = 'Não conseguimos carregar seus documentos agora.';
      });
    }
  }

  IconData _statusIcon(String status) {
    return switch (status) {
      'approved' => Icons.verified_rounded,
      'pending' => Icons.schedule_rounded,
      'rejected' => Icons.cancel_rounded,
      'expired' => Icons.event_busy_rounded,
      _ => Icons.description_rounded,
    };
  }

  Color _statusColor(BuildContext context, String status) {
    return switch (status) {
      'approved' => RamoColors.success,
      'pending' => RamoColors.brandYellow,
      'rejected' || 'expired' => Theme.of(context).colorScheme.error,
      _ => RamoColors.muted,
    };
  }

  String _requiredTitle(String type) {
    return switch (type) {
      'driver_license' => 'CNH',
      'vehicle_registration' => 'CRLV',
      _ => type,
    };
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;

    return Scaffold(
      appBar: AppBar(title: const Text('Documentos')),
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
            if (_loading && snapshot == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && snapshot == null) ...[
              const SizedBox(height: 48),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: RamoColors.muted),
              ),
              const SizedBox(height: RamoSpacing.md),
              FilledButton(
                onPressed: _load,
                child: const Text('Tentar novamente'),
              ),
            ] else if (snapshot != null) ...[
              Container(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  color: snapshot.documentsApproved
                      ? RamoColors.brandBlack
                      : RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                ),
                child: Row(
                  children: [
                    Icon(
                      snapshot.documentsApproved
                          ? Icons.verified_user_rounded
                          : Icons.rule_folder_rounded,
                      color: snapshot.documentsApproved
                          ? RamoColors.brandYellow
                          : RamoColors.brandBlack,
                      size: 30,
                    ),
                    const SizedBox(width: RamoSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            snapshot.documentsApproved
                                ? 'Documentação aprovada'
                                : 'Documentação pendente',
                            style: TextStyle(
                              color: snapshot.documentsApproved
                                  ? Colors.white
                                  : RamoColors.brandBlack,
                              fontWeight: FontWeight.w900,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            snapshot.documentsApproved
                                ? 'CNH e CRLV estão válidos no Ramo Nessa.'
                                : 'Acompanhe abaixo o status de cada documento.',
                            style: TextStyle(
                              color: snapshot.documentsApproved
                                  ? Colors.white70
                                  : RamoColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
              ...snapshot.requiredDocumentTypes.map((type) {
                final item = snapshot.byType(type);
                return Padding(
                  padding: const EdgeInsets.only(bottom: RamoSpacing.md),
                  child: _DocumentCard(
                    title: _requiredTitle(type),
                    item: item,
                    statusIcon: item == null
                        ? Icons.upload_file_rounded
                        : _statusIcon(item.effectiveStatus),
                    statusColor: item == null
                        ? RamoColors.muted
                        : _statusColor(context, item.effectiveStatus),
                  ),
                );
              }),
              const SizedBox(height: RamoSpacing.md),
              Container(
                padding: const EdgeInsets.all(RamoSpacing.md),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded),
                    SizedBox(width: RamoSpacing.sm),
                    Expanded(
                      child: Text(
                        'O envio e a substituição dos arquivos ainda são feitos pela equipe administrativa, porque o storage privado atual do projeto é somente leitura. Esta tela mostra o status real registrado no Core.',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    required this.title,
    required this.item,
    required this.statusIcon,
    required this.statusColor,
  });

  final String title;
  final DriverDocumentItem? item;
  final IconData statusIcon;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    final current = item;

    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: Colors.white,
            child: Icon(statusIcon, color: statusColor),
          ),
          const SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  current == null
                      ? 'Não enviado'
                      : current.statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (current?.expiresOn != null) ...[
                  const SizedBox(height: 6),
                  Text('Validade: ${current!.expiresOn}'),
                ],
                if (current?.rejectionReason?.trim().isNotEmpty == true) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Motivo: ${current!.rejectionReason}',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                if (current != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Enviado em ${_dateLabel(current.submittedAt)}',
                    style: const TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _dateLabel(DateTime value) {
    final local = value.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    return '$day/$month/${local.year}';
  }
}
