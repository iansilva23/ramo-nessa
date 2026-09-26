import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../map/data/place_autocomplete_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';
import '../../profile/data/passenger_saved_place_service.dart';
import '../../profile/presentation/passenger_saved_places_screen.dart';

class DestinationSearchScreen extends StatefulWidget {
  const DestinationSearchScreen({
    super.key,
    this.searchService,
    this.autocompleteService,
    this.savedPlaceService,
    this.title = 'Escolher destino',
    this.hintText = 'Busque rua, pousada ou lugar',
    this.emptyTitle = 'Busque seu destino',
  });

  final PlaceSearchService? searchService;
  final PlaceAutocompleteService? autocompleteService;
  final PassengerSavedPlaceService? savedPlaceService;
  final String title;
  final String hintText;
  final String emptyTitle;

  @override
  State<DestinationSearchScreen> createState() =>
      _DestinationSearchScreenState();
}

class _DestinationSearchScreenState extends State<DestinationSearchScreen> {
  final _controller = TextEditingController();

  late final PlaceSearchService _searchService =
      widget.searchService ?? const _MissingPlaceSearchService();
  late final PlaceAutocompleteService? _autocompleteService =
      widget.autocompleteService;

  List<RamoPlace> _results = const [];
  List<PlaceAutocompleteSuggestion> _suggestions = const [];
  Timer? _debounce;
  String? _sessionToken;
  bool _loading = false;
  String? _error;
  int _requestId = 0;
  bool _savedExpanded = false;
  bool _savedLoading = false;
  bool _savedLoaded = false;
  String? _savedError;
  List<PassengerSavedPlace> _savedPlaces = const [];

  @override
  void initState() {
    super.initState();
    final autocomplete = _autocompleteService;
    if (autocomplete != null) {
      _sessionToken = autocomplete.beginSession();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _toggleSavedPlaces() async {
    final service = widget.savedPlaceService;
    if (service == null) return;

    final next = !_savedExpanded;
    setState(() => _savedExpanded = next);
    if (next && !_savedLoaded && !_savedLoading) {
      await _loadSavedPlaces();
    }
  }

  Future<void> _loadSavedPlaces() async {
    final service = widget.savedPlaceService;
    if (service == null || _savedLoading) return;

    setState(() {
      _savedLoading = true;
      _savedError = null;
    });
    try {
      final items = await service.list();
      if (!mounted) return;
      setState(() {
        _savedPlaces = items;
        _savedLoaded = true;
        _savedLoading = false;
      });
    } on PassengerSavedPlaceException catch (error) {
      if (!mounted) return;
      setState(() {
        _savedLoading = false;
        _savedLoaded = true;
        _savedError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _savedLoading = false;
        _savedLoaded = true;
        _savedError = 'Não conseguimos carregar seus endereços agora.';
      });
    }
  }

  Future<void> _openSavedPlacesManager() async {
    final service = widget.savedPlaceService;
    if (service == null) return;

    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => PassengerSavedPlacesScreen(
          service: service,
          searchService: _searchService,
        ),
      ),
    );
    if (!mounted) return;
    await _loadSavedPlaces();
  }

  void _selectSavedPlace(PassengerSavedPlace place) {
    Navigator.of(context).pop(
      RamoPlace(
        name: place.name,
        address: place.address,
        position: place.position,
      ),
    );
  }

  IconData _savedPlaceIcon(PassengerSavedPlace place) {
    return switch (place.kind) {
      'home' => Icons.home_rounded,
      'work' => Icons.work_rounded,
      _ => Icons.bookmark_rounded,
    };
  }

  void _onQueryChanged(String value) {
    _requestId++;
    _debounce?.cancel();
    final query = value.trim();

    setState(() {
      _results = const [];
      _suggestions = const [];
      _loading = false;
      _error = null;
    });

    final autocomplete = _autocompleteService;
    if (autocomplete == null || query.isEmpty) {
      return;
    }

    final requestId = _requestId;
    _debounce = Timer(
      const Duration(milliseconds: 300),
      () => unawaited(_loadSuggestions(query, requestId)),
    );
  }

  Future<void> _loadSuggestions(
    String query,
    int requestId,
  ) async {
    final autocomplete = _autocompleteService;
    final sessionToken = _sessionToken;
    if (
      autocomplete == null ||
      sessionToken == null ||
      requestId != _requestId
    ) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final suggestions = await autocomplete.suggestions(
        query,
        sessionToken: sessionToken,
      );
      if (!mounted || requestId != _requestId) return;

      setState(() {
        _suggestions = suggestions;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || requestId != _requestId) return;

      setState(() {
        _suggestions = const [];
        _loading = false;
        _error =
            'Não conseguimos sugerir lugares agora. Você ainda pode usar Buscar.';
      });
    }
  }

  Future<void> _selectSuggestion(
    PlaceAutocompleteSuggestion suggestion,
  ) async {
    final autocomplete = _autocompleteService;
    final sessionToken = _sessionToken;
    if (
      autocomplete == null ||
      sessionToken == null ||
      _loading
    ) {
      return;
    }

    _debounce?.cancel();
    final requestId = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final place = await autocomplete.resolve(
        suggestion,
        sessionToken: sessionToken,
      );
      if (!mounted || requestId != _requestId) return;
      Navigator.of(context).pop(place);
    } catch (_) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos abrir esse destino agora.';
      });
    }
  }

  Future<void> _submitSearch() async {
    final query = _controller.text.trim();
    if (query.length < 3 || _loading) {
      return;
    }

    _debounce?.cancel();
    FocusScope.of(context).unfocus();
    await _search(query);
  }

  Future<void> _search(String query) async {
    final requestId = ++_requestId;

    setState(() {
      _loading = true;
      _error = null;
      _suggestions = const [];
    });

    try {
      final results = await _searchService.search(query);
      if (!mounted || requestId != _requestId) {
        return;
      }

      setState(() {
        _results = results;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || requestId != _requestId) {
        return;
      }

      setState(() {
        _results = const [];
        _loading = false;
        _error = 'Não conseguimos buscar lugares agora. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSearch = _controller.text.trim().length >= 3 && !_loading;
    final showingSuggestions = _suggestions.isNotEmpty;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.md,
            RamoSpacing.sm,
            RamoSpacing.md,
            RamoSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    tooltip: 'Voltar',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                  const SizedBox(width: RamoSpacing.xs),
                  Expanded(
                    child: Text(
                      widget.title,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.8,
                          ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: RamoSpacing.md),
              Container(
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                ),
                child: TextField(
                  autofocus: true,
                  controller: _controller,
                  onChanged: _onQueryChanged,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _submitSearch(),
                  decoration: InputDecoration(
                    hintText: widget.hintText,
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: IconButton(
                      tooltip: 'Buscar',
                      onPressed: canSearch ? _submitSearch : null,
                      icon: const Icon(Icons.arrow_forward_rounded),
                    ),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: RamoSpacing.md,
                      vertical: 17,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: RamoSpacing.xs),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  showingSuggestions
                      ? 'Sugestões enquanto você digita'
                      : 'Pousada, hotel, restaurante, rua ou ponto turístico',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: RamoColors.muted,
                      ),
                ),
              ),
              if (widget.savedPlaceService != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                Material(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                  child: Column(
                    children: [
                      InkWell(
                        borderRadius:
                            BorderRadius.circular(RamoRadius.md),
                        onTap: _toggleSavedPlaces,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: RamoSpacing.md,
                            vertical: RamoSpacing.sm,
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.bookmarks_outlined,
                                size: 21,
                              ),
                              const SizedBox(width: RamoSpacing.sm),
                              const Expanded(
                                child: Text(
                                  'Meus endereços',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: _savedExpanded
                                    ? 'Ocultar meus endereços'
                                    : 'Mostrar meus endereços',
                                visualDensity: VisualDensity.compact,
                                onPressed: _toggleSavedPlaces,
                                icon: Icon(
                                  _savedExpanded
                                      ? Icons.remove_rounded
                                      : Icons.add_rounded,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 220),
                        curve: Curves.easeOutCubic,
                        child: !_savedExpanded
                            ? const SizedBox.shrink()
                            : Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  RamoSpacing.sm,
                                  0,
                                  RamoSpacing.sm,
                                  RamoSpacing.sm,
                                ),
                                child: _savedLoading
                                    ? const Padding(
                                        padding: EdgeInsets.all(
                                          RamoSpacing.md,
                                        ),
                                        child: Center(
                                          child:
                                              CircularProgressIndicator(),
                                        ),
                                      )
                                    : _savedError != null
                                        ? Column(
                                            children: [
                                              Text(
                                                _savedError!,
                                                textAlign:
                                                    TextAlign.center,
                                                style: const TextStyle(
                                                  color:
                                                      RamoColors.muted,
                                                ),
                                              ),
                                              TextButton(
                                                onPressed:
                                                    _loadSavedPlaces,
                                                child: const Text(
                                                  'Tentar novamente',
                                                ),
                                              ),
                                            ],
                                          )
                                        : _savedPlaces.isEmpty
                                            ? Column(
                                                children: [
                                                  const Padding(
                                                    padding:
                                                        EdgeInsets.all(
                                                      RamoSpacing.md,
                                                    ),
                                                    child: Text(
                                                      'Você ainda não possui endereços salvos.',
                                                      textAlign:
                                                          TextAlign.center,
                                                      style: TextStyle(
                                                        color: RamoColors
                                                            .muted,
                                                      ),
                                                    ),
                                                  ),
                                                  FilledButton.tonalIcon(
                                                    key: const Key(
                                                      'destination-add-saved-place',
                                                    ),
                                                    onPressed:
                                                        _openSavedPlacesManager,
                                                    icon: const Icon(
                                                      Icons.add_rounded,
                                                    ),
                                                    label: const Text(
                                                      'Cadastrar endereço',
                                                    ),
                                                  ),
                                                ],
                                              )
                                            : Column(
                                                children: [
                                                  ConstrainedBox(
                                                    constraints:
                                                        const BoxConstraints(
                                                      maxHeight: 190,
                                                    ),
                                                    child: ListView.builder(
                                                      shrinkWrap: true,
                                                      itemCount:
                                                          _savedPlaces.length,
                                                      itemBuilder:
                                                          (context, index) {
                                                        final place =
                                                            _savedPlaces[
                                                                index];
                                                        return ListTile(
                                                          dense: true,
                                                          contentPadding:
                                                              const EdgeInsets
                                                                  .symmetric(
                                                            horizontal: 6,
                                                          ),
                                                          leading: Icon(
                                                            _savedPlaceIcon(
                                                              place,
                                                            ),
                                                          ),
                                                          title: Text(
                                                            place.label,
                                                            style:
                                                                const TextStyle(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w800,
                                                            ),
                                                          ),
                                                          subtitle: Text(
                                                            place.name,
                                                            maxLines: 1,
                                                            overflow:
                                                                TextOverflow
                                                                    .ellipsis,
                                                          ),
                                                          trailing:
                                                              const Icon(
                                                            Icons
                                                                .north_west_rounded,
                                                            size: 17,
                                                          ),
                                                          onTap: () =>
                                                              _selectSavedPlace(
                                                            place,
                                                          ),
                                                        );
                                                      },
                                                    ),
                                                  ),
                                                  TextButton(
                                                    onPressed:
                                                        _openSavedPlacesManager,
                                                    child: const Text(
                                                      'Gerenciar endereços',
                                                    ),
                                                  ),
                                                ],
                                              ),
                              ),
                      ),
                    ],
                  ),
                ),
              ],
              if (_loading) ...[
                const SizedBox(height: RamoSpacing.sm),
                const ClipRRect(
                  borderRadius: BorderRadius.all(Radius.circular(99)),
                  child: LinearProgressIndicator(minHeight: 3),
                ),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: RamoSpacing.md),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              const SizedBox(height: RamoSpacing.sm),
              if (
                _suggestions.isEmpty &&
                _results.isEmpty &&
                !_loading &&
                _error == null
              )
                Expanded(child: _SearchHint(title: widget.emptyTitle))
              else if (_suggestions.isEmpty && _results.isEmpty)
                const Expanded(child: SizedBox.shrink())
              else
                Expanded(
                  child: showingSuggestions
                      ? ListView.separated(
                          itemCount: _suggestions.length + 1,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: RamoSpacing.xs),
                          itemBuilder: (context, index) {
                            if (index == _suggestions.length) {
                              return const Padding(
                                padding: EdgeInsets.only(
                                  top: RamoSpacing.sm,
                                  bottom: RamoSpacing.xs,
                                ),
                                child: Center(
                                  child: Text(
                                    'Google Maps',
                                    key: Key('google-maps-attribution'),
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: RamoColors.muted,
                                    ),
                                  ),
                                ),
                              );
                            }

                            final suggestion = _suggestions[index];
                            return _SuggestionTile(
                              suggestion: suggestion,
                              onTap: () => _selectSuggestion(suggestion),
                            );
                          },
                        )
                      : ListView.separated(
                          itemCount: _results.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: RamoSpacing.xs),
                          itemBuilder: (context, index) {
                            final place = _results[index];
                            return _PlaceTile(
                              place: place,
                              onTap: () =>
                                  Navigator.of(context).pop(place),
                            );
                          },
                        ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SuggestionTile extends StatelessWidget {
  const _SuggestionTile({
    required this.suggestion,
    required this.onTap,
  });

  final PlaceAutocompleteSuggestion suggestion;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RamoColors.surfaceRaised,
      borderRadius: BorderRadius.circular(RamoRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(RamoRadius.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: RamoSpacing.md,
            vertical: RamoSpacing.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.location_on_rounded,
                  size: 20,
                ),
              ),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      suggestion.mainText,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (suggestion.secondaryText.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        suggestion.secondaryText,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(
                              color: RamoColors.muted,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: RamoSpacing.xs),
              Icon(
                Icons.north_west_rounded,
                size: 18,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: .34),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({
    required this.place,
    required this.onTap,
  });

  final RamoPlace place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RamoColors.surfaceRaised,
      borderRadius: BorderRadius.circular(RamoRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(RamoRadius.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: RamoSpacing.md,
            vertical: RamoSpacing.sm,
          ),
          child: Row(
            children: [
              const Icon(
                Icons.location_on_rounded,
                size: 22,
              ),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      place.displayName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      place.address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(
                            color: RamoColors.muted,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: RamoSpacing.xs),
              Icon(
                Icons.chevron_right_rounded,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: .30),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchHint extends StatelessWidget {
  const _SearchHint({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 66,
              height: 66,
              decoration: BoxDecoration(
                color: RamoColors.surfaceRaised,
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(
                Icons.map_outlined,
                size: 30,
                color: RamoColors.brandBlack,
              ),
            ),
            const SizedBox(height: RamoSpacing.sm),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Comece a digitar para ver sugestões. A busca manual fica disponível a partir de 3 caracteres.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: RamoColors.muted,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MissingPlaceSearchService implements PlaceSearchService {
  const _MissingPlaceSearchService();

  @override
  Future<List<RamoPlace>> search(String query) {
    return Future<List<RamoPlace>>.error(
      StateError(
        'A busca de destinos precisa ser fornecida pelo app.',
      ),
    );
  }
}
