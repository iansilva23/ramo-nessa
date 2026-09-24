import 'package:file_picker/file_picker.dart';
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
  String? _uploadingType;

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

  String? _mimeTypeFor(PlatformFile file) {
    switch (file.extension?.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
        return 'application/pdf';
      default:
        return null;
    }
  }

  String _dateOnly(DateTime value) {
    final month = value.month.toString().padLeft(2, '0');
    final day = value.day.toString().padLeft(2, '0');
    return '${value.year}-$month-$day';
  }

  Future<void> _pickAndUpload(String documentType) async {
    if (_uploadingType != null) return;

    PlatformFile? file;
    try {
      file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
        dialogTitle: documentType == 'driver_license'
            ? 'Escolher CNH'
            : 'Escolher CRLV',
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Não foi possível abrir o seletor de arquivos.';
      });
      return;
    }
    if (file == null || !mounted) return;

    final mimeType = _mimeTypeFor(file);
    if (mimeType == null) {
      setState(() {
        _error = 'Escolha um arquivo JPG, PNG ou PDF.';
      });
      return;
    }

    try {
      final reportedLength = file.lengthSync() ?? await file.length();
      if (reportedLength != null && reportedLength > 20 * 1024 * 1024) {
        if (!mounted) return;
        setState(() {
          _error = 'O documento precisa ter no máximo 20 MB.';
        });
        return;
      }

      final now = DateTime.now();
      final expires = await showDatePicker(
        context: context,
        initialDate: DateTime(now.year + 1, now.month, now.day),
        firstDate: DateTime(now.year, now.month, now.day),
        lastDate: DateTime(now.year + 20, 12, 31),
        helpText: 'Validade do documento (opcional)',
        cancelText: 'Sem validade',
        confirmText: 'Usar esta data',
      );
      if (!mounted) return;

      final bytes = await file.readAsBytes();
      if (bytes.isEmpty || bytes.length > 20 * 1024 * 1024) {
        setState(() {
          _error = bytes.isEmpty
              ? 'O arquivo selecionado está vazio.'
              : 'O documento precisa ter no máximo 20 MB.';
        });
        return;
      }

      setState(() {
        _uploadingType = documentType;
        _error = null;
      });

      await widget.api.uploadDocument(
        documentType: documentType,
        mimeType: mimeType,
        bytes: bytes,
        expiresOn: expires == null ? null : _dateOnly(expires),
      );
      await _load();
      if (!mounted) return;
      setState(() => _uploadingType = null);

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text(
              'Documento enviado. A equipe fará a análise.',
            ),
          ),
        );
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _uploadingType = null;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _uploadingType = null;
        _error = 'Não conseguimos enviar o documento agora.';
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
                    uploading: _uploadingType == type,
                    onUpload: _uploadingType == null
                        ? () => _pickAndUpload(type)
                        : null,
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
                        'Envie CNH e CRLV em JPG, PNG ou PDF. '
                        'Os arquivos ficam em storage privado e só entram '
                        'como aprovados depois da revisão administrativa.',
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
    required this.uploading,
    required this.onUpload,
  });

  final String title;
  final DriverDocumentItem? item;
  final IconData statusIcon;
  final Color statusColor;
  final bool uploading;
  final VoidCallback? onUpload;

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
                const SizedBox(height: RamoSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onUpload,
                    icon: uploading
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.upload_file_rounded),
                    label: Text(
                      uploading
                          ? 'Enviando…'
                          : current == null
                              ? 'Enviar documento'
                              : current.effectiveStatus == 'rejected' ||
                                      current.effectiveStatus == 'expired'
                                  ? 'Enviar novamente'
                                  : 'Substituir documento',
                    ),
                  ),
                ),
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
