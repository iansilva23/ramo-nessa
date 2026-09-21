import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../map/data/nominatim_place_search_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';

class DestinationSearchScreen extends StatefulWidget {
  const DestinationSearchScreen({
    super.key,
    this.searchService,
  });

  final PlaceSearchService? searchService;

  @override
  State<DestinationSearchScreen> createState() => _DestinationSearchScreenState();
}

class _DestinationSearchScreenState extends State<DestinationSearchScreen> {
  final _controller = TextEditingController();

  late final PlaceSearchService _searchService =
      widget.searchService ?? NominatimPlaceSearchService();

  Timer? _debounce;
  List<RamoPlace> _results = const [];
  bool _loading = false;
  String? _error;
  int _requestId = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    final query = value.trim();

    if (query.length < 3) {
      setState(() {
        _results = const [];
        _loading = false;
        _error = null;
      });
      return;
    }

    _debounce = Timer(
      const Duration(milliseconds: 1100),
      () => _search(query),
    );
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
        _error = 'Não conseguimos buscar destinos agora. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasQuery = _controller.text.trim().length >= 3;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Escolher destino'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.md),
          child: Column(
            children: [
              TextField(
                autofocus: true,
                controller: _controller,
                onChanged: _onQueryChanged,
                textInputAction: TextInputAction.search,
                onSubmitted: (value) {
                  _debounce?.cancel();
                  if (value.trim().length >= 3) {
                    _search(value.trim());
                  }
                },
                decoration: const InputDecoration(
                  hintText: 'Busque rua, pousada ou lugar',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: RamoSpacing.md),
              if (_loading) const LinearProgressIndicator(minHeight: 3),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: RamoSpacing.md),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              if (!hasQuery && !_loading)
                const Expanded(child: _SearchHint())
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: _results.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final place = _results[index];

                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: RamoSpacing.xs,
                          vertical: RamoSpacing.xs,
                        ),
                        leading: const CircleAvatar(
                          child: Icon(Icons.place_rounded),
                        ),
                        title: Text(
                          place.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          place.address,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: const Icon(
                          Icons.arrow_forward_ios_rounded,
                          size: 16,
                        ),
                        onTap: () => Navigator.of(context).pop(place),
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
  const _SearchHint();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(RamoSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 42),
            const SizedBox(height: RamoSpacing.sm),
            Text(
              'Digite pelo menos 3 letras',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: RamoSpacing.xs),
            Text(
              'Você pode buscar endereços e lugares no Brasil.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
