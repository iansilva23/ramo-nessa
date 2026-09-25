import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';
import '../data/passenger_saved_place_service.dart';

class PassengerSavedPlacesScreen extends StatefulWidget {
  const PassengerSavedPlacesScreen({
    super.key,
    required this.service,
    required this.searchService,
  });

  final PassengerSavedPlaceService service;
  final PlaceSearchService searchService;

  @override
  State<PassengerSavedPlacesScreen> createState() =>
      _PassengerSavedPlacesScreenState();
}

class _PassengerSavedPlacesScreenState
    extends State<PassengerSavedPlacesScreen> {
  List<PassengerSavedPlace> _items = const [];
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
      final items = await widget.service.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } on PassengerSavedPlaceException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar seus endereços agora.';
      });
    }
  }

  PassengerSavedPlace? _slot(String kind) {
    for (final item in _items) {
      if (item.kind == kind) return item;
    }
    return null;
  }

  Future<void> _openEditor({
    required String kind,
    PassengerSavedPlace? existing,
  }) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => _SavedPlaceEditorScreen(
          service: widget.service,
          searchService: widget.searchService,
          kind: kind,
          existing: existing,
        ),
      ),
    );
    if (changed == true && mounted) {
      await _load();
    }
  }

  Future<void> _delete(PassengerSavedPlace place) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remover favorito?'),
        content: Text(
          '“${place.label}” será removido dos seus endereços salvos.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await widget.service.delete(place.id);
      if (!mounted) return;
      await _load();
    } on PassengerSavedPlaceException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final home = _slot('home');
    final work = _slot('work');
    final custom = _items
        .where((item) => item.kind == 'custom')
        .toList(growable: false);

    return Scaffold(
      appBar: AppBar(title: const Text('Endereços favoritos')),
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
            const Text(
              'Acesso rápido',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            _SavedSlotTile(
              icon: Icons.home_rounded,
              title: 'Casa',
              place: home,
              onTap: () => _openEditor(
                kind: 'home',
                existing: home,
              ),
              onDelete: home == null ? null : () => _delete(home),
            ),
            _SavedSlotTile(
              icon: Icons.work_rounded,
              title: 'Trabalho',
              place: work,
              onTap: () => _openEditor(
                kind: 'work',
                existing: work,
              ),
              onDelete: work == null ? null : () => _delete(work),
            ),
            const Divider(height: RamoSpacing.xxl),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Outros favoritos',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => _openEditor(kind: 'custom'),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Adicionar'),
                ),
              ],
            ),
            if (_loading && _items.isEmpty)
              const Padding(
                padding: EdgeInsets.all(RamoSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && _items.isEmpty) ...[
              const SizedBox(height: RamoSpacing.lg),
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
            ] else if (custom.isEmpty)
              Container(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                ),
                child: const Text(
                  'Salve pousadas, praias, restaurantes ou qualquer local que você usa com frequência.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: RamoColors.muted),
                ),
              )
            else
              ...custom.map(
                (place) => _CustomSavedPlaceTile(
                  place: place,
                  onEdit: () => _openEditor(
                    kind: 'custom',
                    existing: place,
                  ),
                  onDelete: () => _delete(place),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SavedSlotTile extends StatelessWidget {
  const _SavedSlotTile({
    required this.icon,
    required this.title,
    required this.place,
    required this.onTap,
    this.onDelete,
  });

  final IconData icon;
  final String title;
  final PassengerSavedPlace? place;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(icon, color: RamoColors.brandBlack),
      ),
      title: Text(title),
      subtitle: Text(
        place == null
            ? 'Adicionar endereço'
            : '${place!.name} · ${place!.address}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onDelete != null)
            IconButton(
              tooltip: 'Remover',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline_rounded),
            ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
      onTap: onTap,
    );
  }
}

class _CustomSavedPlaceTile extends StatelessWidget {
  const _CustomSavedPlaceTile({
    required this.place,
    required this.onEdit,
    required this.onDelete,
  });

  final PassengerSavedPlace place;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: const CircleAvatar(
        backgroundColor: RamoColors.surfaceRaised,
        child: Icon(
          Icons.star_rounded,
          color: RamoColors.brandBlack,
        ),
      ),
      title: Text(place.label),
      subtitle: Text(
        '${place.name} · ${place.address}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: PopupMenuButton<String>(
        onSelected: (value) {
          if (value == 'edit') onEdit();
          if (value == 'delete') onDelete();
        },
        itemBuilder: (_) => const [
          PopupMenuItem(
            value: 'edit',
            child: Text('Editar'),
          ),
          PopupMenuItem(
            value: 'delete',
            child: Text('Remover'),
          ),
        ],
      ),
      onTap: onEdit,
    );
  }
}

class _SavedPlaceEditorScreen extends StatefulWidget {
  const _SavedPlaceEditorScreen({
    required this.service,
    required this.searchService,
    required this.kind,
    this.existing,
  });

  final PassengerSavedPlaceService service;
  final PlaceSearchService searchService;
  final String kind;
  final PassengerSavedPlace? existing;

  @override
  State<_SavedPlaceEditorScreen> createState() =>
      _SavedPlaceEditorScreenState();
}

class _SavedPlaceEditorScreenState
    extends State<_SavedPlaceEditorScreen> {
  final _queryController = TextEditingController();
  late final TextEditingController _labelController =
      TextEditingController(text: widget.existing?.label ?? '');

  List<RamoPlace> _results = const [];
  RamoPlace? _selected;
  bool _searching = false;
  bool _saving = false;
  String? _error;

  String get _title => switch (widget.kind) {
        'home' => 'Casa',
        'work' => 'Trabalho',
        _ => widget.existing == null
            ? 'Novo favorito'
            : 'Editar favorito',
      };

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _selected = RamoPlace(
        name: existing.name,
        address: existing.address,
        position: existing.position,
      );
      _queryController.text = existing.name;
    }
  }

  @override
  void dispose() {
    _queryController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = _queryController.text.trim();
    if (query.length < 3 || _searching) return;

    setState(() {
      _searching = true;
      _error = null;
    });

    try {
      final results = await widget.searchService.search(query);
      if (!mounted) return;
      setState(() {
        _results = results;
        _searching = false;
        if (results.isEmpty) {
          _error = 'Nenhum local encontrado para essa busca.';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _save() async {
    final selected = _selected;
    if (selected == null || _saving) {
      setState(() {
        _error = 'Escolha um local antes de salvar.';
      });
      return;
    }
    if (
      widget.kind == 'custom' &&
      _labelController.text.trim().length < 2
    ) {
      setState(() {
        _error = 'Dê um nome para este favorito.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.service.save(
        kind: widget.kind,
        label: widget.kind == 'custom'
            ? _labelController.text.trim()
            : null,
        name: selected.name,
        address: selected.address,
        position: selected.position,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on PassengerSavedPlaceException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Não conseguimos salvar este endereço agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;

    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          if (widget.kind == 'custom') ...[
            TextField(
              controller: _labelController,
              enabled: !_saving,
              maxLength: 40,
              decoration: const InputDecoration(
                labelText: 'Nome do favorito',
                hintText: 'Ex.: Praia favorita',
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
          ],
          TextField(
            controller: _queryController,
            enabled: !_saving,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: 'Buscar endereço ou local',
              hintText: 'Ex.: Rua Principal, Jericoacoara',
              suffixIcon: IconButton(
                tooltip: 'Buscar',
                onPressed: _searching ? null : _search,
                icon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.search_rounded),
              ),
            ),
            onSubmitted: (_) => _search(),
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
          if (_results.isNotEmpty) ...[
            const SizedBox(height: RamoSpacing.md),
            const Text(
              'Resultados',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: RamoSpacing.xs),
            ..._results.map(
              (place) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.location_on_outlined),
                title: Text(place.name),
                subtitle: Text(
                  place.address,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: selected == place
                    ? const Icon(
                        Icons.check_circle_rounded,
                        color: RamoColors.success,
                      )
                    : null,
                onTap: _saving
                    ? null
                    : () {
                        setState(() {
                          _selected = place;
                          _error = null;
                        });
                      },
              ),
            ),
          ],
          if (selected != null) ...[
            const SizedBox(height: RamoSpacing.lg),
            Container(
              padding: const EdgeInsets.all(RamoSpacing.md),
              decoration: BoxDecoration(
                color: RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(RamoRadius.md),
              ),
              child: Row(
                children: [
                  const Icon(Icons.place_rounded),
                  const SizedBox(width: RamoSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          selected.name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          selected.address,
                          style: const TextStyle(
                            color: RamoColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: RamoSpacing.xl),
          FilledButton(
            onPressed: _saving || selected == null ? null : _save,
            child: _saving
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Salvar endereço'),
          ),
        ],
      ),
    );
  }
}
