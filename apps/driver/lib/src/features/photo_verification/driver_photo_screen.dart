import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'driver_photo_api.dart';
import 'driver_verification_photo.dart';

class DriverPhotoScreen extends StatefulWidget {
  const DriverPhotoScreen({super.key, required this.api, this.initial});

  final DriverPhotoApi api;
  final DriverPhotoSnapshot? initial;

  @override
  State<DriverPhotoScreen> createState() => _DriverPhotoScreenState();
}

class _DriverPhotoScreenState extends State<DriverPhotoScreen> {
  DriverPhotoSnapshot? _snapshot;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _snapshot = widget.initial;
    if (_snapshot == null) _run(() async {});
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      final snapshot = await widget.api.status();
      if (mounted) setState(() => _snapshot = snapshot);
    } on DriverPhotoException catch (error) {
      if (mounted) setState(() => _error = error.problem.message);
    } on DriverPhotoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível concluir. Confira a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose(DriverVerificationPhoto field) => _run(() async {
    final snapshot = _snapshot!;
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Tirar foto'),
              onTap: () => Navigator.pop(sheet, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Escolher da galeria'),
              onTap: () => Navigator.pop(sheet, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final picked = await ImagePicker().pickImage(
      source: source,
      requestFullMetadata: false,
    );
    if (picked == null || !mounted) return;
    if (await picked.length() > 12 * 1024 * 1024) {
      throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
    }
    final photo = await prepareDriverVerificationPhoto(
      field,
      await picked.readAsBytes(),
    );
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(field.label),
        content: SizedBox(
          width: 420,
          height: 240,
          child: InteractiveViewer(
            child: Image.memory(photo.bytes, fit: BoxFit.contain),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Escolher outra'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Salvar foto'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted)
      await widget.api.upload(snapshot, field, photo);
  });

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final items = snapshot?.photos ?? const <String, DriverPhotoItem>{};
    final count = items.values
        .where((photo) => photo.status != 'rejected')
        .length;
    return Scaffold(
      appBar: AppBar(title: const Text('Fotos do cadastro')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null) ...[
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  TextButton(
                    onPressed: _busy ? null : () => _run(() async {}),
                    child: const Text('Atualizar'),
                  ),
                ],
                if (snapshot != null) ...[
                  Text(
                    '$count de 5 fotos',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  for (final field in DriverVerificationPhoto.values)
                    _photoField(field, items[field.field], snapshot),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed:
                        !_busy &&
                            count == 5 &&
                            items.values.any((photo) => photo.status == 'draft')
                        ? () => _run(() => widget.api.submit(snapshot))
                        : null,
                    child: const Text('Enviar para análise'),
                  ),
                ] else if (!_busy && _error == null)
                  const Text('O envio de fotos está indisponível.'),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _photoField(
    DriverVerificationPhoto field,
    DriverPhotoItem? item,
    DriverPhotoSnapshot snapshot,
  ) {
    final status = switch (item?.status) {
      'draft' => 'Salva no rascunho',
      'pending' => 'Em análise',
      'approved' => 'Aprovada',
      'rejected' => item?.reason ?? 'Envie novamente',
      _ => 'Falta enviar',
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(field.label, style: Theme.of(context).textTheme.titleMedium),
            Text(field.guide),
            Text(status),
            Wrap(
              children: [
                TextButton(
                  onPressed: _busy || item?.status == 'pending'
                      ? null
                      : () => _choose(field),
                  child: Text(
                    item == null ? 'Adicionar foto' : 'Substituir foto',
                  ),
                ),
                if (item?.status == 'draft')
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => _run(() => widget.api.remove(snapshot, field)),
                    child: const Text('Remover'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

extension on DriverVerificationPhoto {
  String get label => switch (this) {
    DriverVerificationPhoto.portrait => 'Foto do rosto',
    DriverVerificationPhoto.vehicleFront => 'Frente do veículo',
    DriverVerificationPhoto.vehicleRear => 'Traseira do veículo',
    DriverVerificationPhoto.vehicleLeft => 'Lateral esquerda',
    DriverVerificationPhoto.vehicleRight => 'Lateral direita',
  };

  String get guide => switch (this) {
    DriverVerificationPhoto.portrait =>
      'Olhe de frente, sem capacete nem óculos escuros.',
    DriverVerificationPhoto.vehicleFront =>
      'Mostre a frente inteira, com a placa se houver.',
    DriverVerificationPhoto.vehicleRear =>
      'Mostre a traseira inteira e deixe a placa legível.',
    _ => 'Mostre o veículo inteiro deste lado.',
  };
}
