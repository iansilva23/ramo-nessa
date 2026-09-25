import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';

class DestinationSearchScreen extends StatefulWidget {
  const DestinationSearchScreen({
    super.key,
    this.searchService,
    this.title = 'Escolher destino',
    this.hintText = 'Busque rua, pousada ou lugar',
    this.emptyTitle = 'Busque seu destino',
  });

  final PlaceSearchService? searchService;
  final String title;
  final String hintText;
  final String emptyTitle;

  @override
  State<DestinationSearchScreen> createState() => _DestinationSearchScreenState();
}

class _DestinationSearchScreenState extends State<DestinationSearchScreen> {
  final _controller = TextEditingController();

  late final PlaceSearchService _searchService =
      widget.searchService ?? const _MissingPlaceSearchService();

  List<RamoPlace> _results = const [];
  bool _loading = false;
  String? _error;
  int _requestId = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _requestId++;

    setState(() {
      _results = const [];
      _loading = false;
      _error = null;
    });
  }

  Future<void> _submitSearch() async {
    final query = _controller.text.trim();
    if (query.length < 3 || _loading) {
      return;
    }

    FocusScope.of(context).unfocus();
    await _search(query);
  }

  Future<void> _search(String query) async {
    final requestId = ++_requestId;

    setState(() {
      _loading = true;
      _error = null;
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
                  'Pousada, rua, ponto turístico ou cidade',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: RamoColors.muted,
                      ),
                ),
              ),
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
              if (_results.isEmpty && !_loading && _error == null)
                Expanded(child: _SearchHint(title: widget.emptyTitle))
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: _results.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: RamoSpacing.xs),
                    itemBuilder: (context, index) {
                      final place = _results[index];

                      return Material(
                        color: RamoColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(RamoRadius.md),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(RamoRadius.md),
                          onTap: () => Navigator.of(context).pop(place),
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
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
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
              'Digite pelo menos 3 caracteres para começar.',
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
