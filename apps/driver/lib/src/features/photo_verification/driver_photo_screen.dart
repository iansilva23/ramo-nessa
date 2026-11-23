import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'driver_photo_api.dart';
import 'driver_photo_picker.dart';
import 'driver_verification_photo.dart';

class DriverPhotoScreen extends StatefulWidget {
  const DriverPhotoScreen({
    super.key,
    required this.api,
    this.initial,
    this.portraitReplacement = false,
  });

  final DriverPhotoApi api;
  final DriverPhotoSnapshot? initial;
  final bool portraitReplacement;

  @override
  State<DriverPhotoScreen> createState() => _DriverPhotoScreenState();
}

class _DriverPhotoScreenState extends State<DriverPhotoScreen> {
  DriverPhotoSnapshot? _snapshot;
  DriverVerificationPhoto? _selected;
  PreparedDriverPhoto? _preview;
  String? _activity;
  String? _error;

  @override
  void initState() {
    super.initState();
    _snapshot = widget.initial;
    if (_snapshot == null) {
      _run('Carregando fotos…', _refresh);
    }
  }

  Future<void> _refresh() async {
    final snapshot = await widget.api.status();
    if (mounted) setState(() => _snapshot = snapshot);
  }

  Future<void> _run(String activity, Future<void> Function() action) async {
    if (_activity != null) return;
    setState(() {
      _activity = activity;
      _error = null;
    });
    try {
      await action();
    } on DriverPhotoException catch (error) {
      if (mounted) setState(() => _error = error.problem.message);
    } on DriverPhotoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = switch (activity) {
            'Preparando a foto…' =>
              'Não conseguimos abrir esta foto. Escolha outra da galeria.',
            'Salvando a foto…' => 'Não foi possível salvar. A prévia está aqui para você tentar de novo.',
            _ => 'Não foi possível atualizar suas fotos agora.',
          },
        );
      }
    } finally {
      if (mounted) setState(() => _activity = null);
    }
  }

  void _select(DriverVerificationPhoto field) {
    setState(() {
      _selected = field;
      _preview = null;
      _error = null;
    });
  }

  Future<void> _pick(DriverVerificationPhoto field, {required bool camera}) =>
      _run('Preparando a foto…', () async {
        final photo = await pickDriverPhoto(field, camera: camera);
        if (mounted && photo != null) setState(() => _preview = photo);
      });

  Future<void> _save(
    DriverPhotoSnapshot snapshot,
    DriverVerificationPhoto field,
  ) => _run('Salvando a foto…', () async {
    final saved = await widget.api.upload(snapshot, field, _preview!);
    if (!mounted) return;
    setState(() {
      _snapshot = snapshot.withPhoto(field, saved);
      _selected = null;
      _preview = null;
    });
  });

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final items = snapshot?.photos ?? const <String, DriverPhotoItem>{};
    final count = items.values
        .where((photo) => photo.status != 'rejected')
        .length;
    final canSubmit =
        _activity == null &&
        _preview == null &&
        (widget.portraitReplacement
            ? items[DriverVerificationPhoto.portrait.field]?.status == 'draft'
            : count == 5 &&
                  items.values.any((photo) => photo.status == 'draft'));
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.portraitReplacement
            ? 'Foto de perfil'
            : 'Fotos do cadastro'),
      ),
      bottomNavigationBar: snapshot == null
          ? null
          : SafeArea(
              top: false,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: colors.surface,
                  border: Border(top: BorderSide(color: colors.outlineVariant)),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                  child: Align(
                    alignment: Alignment.center,
                    heightFactor: 1,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: canSubmit
                              ? () => _run('Enviando para análise…', () async {
                                  await widget.api.submit(
                                    snapshot,
                                    portraitReplacement: widget.portraitReplacement,
                                  );
                                  await _refresh();
                                })
                              : null,
                          icon: const Icon(Icons.arrow_forward_rounded),
                          label: const Text('Enviar para análise'),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: RamoReveal(
              child: ListView(
                padding: const EdgeInsets.all(RamoSpacing.xl),
                children: [
                  const RamoBrandLockup(),
                  const SizedBox(height: RamoSpacing.xxl),
                  Text(
                    widget.portraitReplacement
                        ? 'Envie uma nova foto'
                        : 'Confirme seu cadastro',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: RamoSpacing.xs),
                  Text(
                    widget.portraitReplacement
                        ? 'Sua foto atual continua no perfil até a equipe aprovar a nova.'
                        : 'Envie uma foto do rosto e quatro do veículo para a equipe revisar.',
                    style: TextStyle(color: colors.onSurfaceVariant),
                  ),
                  if (snapshot != null && !widget.portraitReplacement) ...[
                    const SizedBox(height: RamoSpacing.md),
                    Text(
                      '$count de 5 fotos salvas',
                      style: theme.textTheme.labelLarge,
                    ),
                    const SizedBox(height: RamoSpacing.xs),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(RamoRadius.pill),
                      child: LinearProgressIndicator(
                        value: count / 5,
                        minHeight: 6,
                      ),
                    ),
                  ],
                  if (_activity != null) ...[
                    const SizedBox(height: RamoSpacing.md),
                    Semantics(liveRegion: true, child: Text(_activity!)),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: RamoSpacing.md),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.errorContainer,
                        borderRadius: BorderRadius.circular(RamoRadius.md),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(RamoSpacing.sm),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            _error!,
                            style: TextStyle(color: colors.onErrorContainer),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (snapshot == null && _activity == null)
                    TextButton(
                      onPressed: () => _run('Carregando fotos…', _refresh),
                      child: const Text('Atualizar cadastro'),
                    )
                  else if (snapshot != null) ...[
                    const SizedBox(height: RamoSpacing.xl),
                    Text('Seu rosto', style: theme.textTheme.titleMedium),
                    const SizedBox(height: RamoSpacing.xs),
                    _photoField(DriverVerificationPhoto.portrait, snapshot),
                    if (!widget.portraitReplacement) ...[
                      const SizedBox(height: RamoSpacing.lg),
                      Text('Seu veículo', style: theme.textTheme.titleMedium),
                      const SizedBox(height: RamoSpacing.xs),
                      for (final field in DriverVerificationPhoto.values.skip(1))
                        _photoField(field, snapshot),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _photoField(
    DriverVerificationPhoto field,
    DriverPhotoSnapshot snapshot,
  ) {
    final item = snapshot.photos[field.field];
    final selected = _selected == field;
    final available = _activity == null;
    final colors = Theme.of(context).colorScheme;
    final (status, icon) = switch (item?.status) {
      'draft' => ('Salva', Icons.check_circle_outline_rounded),
      'pending' => ('Em análise', Icons.schedule_rounded),
      'approved' => ('Aprovada', Icons.verified_outlined),
      'rejected' => ('Reenvio solicitado', Icons.info_outline_rounded),
      _ => ('Adicionar foto', Icons.add_a_photo_outlined),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: RamoSpacing.xs),
      child: Material(
        color: selected ? colors.surfaceContainerLow : colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RamoRadius.md),
          side: BorderSide(
            color: selected ? colors.primary : colors.outlineVariant,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: Icon(field.icon, color: colors.onSurfaceVariant),
              title: Text(field.label),
              subtitle: Text(
                status,
                style: TextStyle(
                  color: item?.status == 'rejected'
                      ? colors.error
                      : colors.onSurfaceVariant,
                ),
              ),
              trailing: Icon(
                icon,
                color: item?.status == 'rejected'
                    ? colors.error
                    : colors.onSurfaceVariant,
              ),
              onTap:
                  available &&
                      item?.status != 'pending' &&
                      (_preview == null || selected)
                  ? () => selected
                        ? setState(() {
                            _selected = null;
                            _preview = null;
                          })
                        : _select(field)
                  : null,
            ),
            if (selected)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item?.reason ?? field.guide),
                    const SizedBox(height: RamoSpacing.sm),
                    if (_preview case final photo?) ...[
                      Center(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(RamoRadius.sm),
                          child: SizedBox(
                            height: 190,
                            child: InteractiveViewer(
                              child: Image.memory(
                                photo.bytes,
                                fit: BoxFit.contain,
                                semanticLabel: field.label,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: RamoSpacing.sm),
                    ],
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        if (_preview != null)
                          FilledButton(
                            onPressed: available
                                ? () => _save(snapshot, field)
                                : null,
                            child: const Text('Salvar foto'),
                          )
                        else
                          FilledButton.tonalIcon(
                            onPressed: available
                                ? () => _pick(field, camera: true)
                                : null,
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: const Text('Tirar foto'),
                          ),
                        OutlinedButton.icon(
                          onPressed: available
                              ? () => _pick(field, camera: false)
                              : null,
                          icon: const Icon(Icons.photo_library_outlined),
                          label: Text(
                            _preview == null ? 'Galeria' : 'Escolher outra',
                          ),
                        ),
                        if (_preview != null)
                          TextButton(
                            onPressed: available
                                ? () => setState(() {
                                    _preview = null;
                                    _error = null;
                                  })
                                : null,
                            child: const Text('Descartar prévia'),
                          )
                        else if (item?.status == 'draft')
                          TextButton(
                            onPressed: available
                                ? () => _run('Removendo foto…', () async {
                                    await widget.api.remove(snapshot, field);
                                    await _refresh();
                                  })
                                : null,
                            child: const Text('Remover'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

extension on DriverVerificationPhoto {
  IconData get icon => switch (this) {
    DriverVerificationPhoto.portrait => Icons.face_retouching_natural_outlined,
    DriverVerificationPhoto.vehicleFront => Icons.directions_car_outlined,
    DriverVerificationPhoto.vehicleRear => Icons.pin_outlined,
    _ => Icons.airport_shuttle_outlined,
  };

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
