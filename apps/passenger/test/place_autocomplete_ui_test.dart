import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/destination_search_screen.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_autocomplete_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';

void main() {
  testWidgets(
    'autocomplete sugere desde a primeira letra e resolve na mesma sessão',
    (tester) async {
      final service = _FakeAutocompleteService();

      await tester.pumpWidget(
        MaterialApp(
          home: _AutocompleteHost(service: service),
        ),
      );

      await tester.tap(find.byKey(const Key('open-search')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'J');
      await tester.pump(const Duration(milliseconds: 299));
      expect(service.suggestionCalls, 0);

      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();

      expect(service.suggestionCalls, 1);
      expect(service.manualSearchCalls, 0);
      expect(find.text('Jericoacoara'), findsOneWidget);
      expect(
        find.byKey(const Key('google-maps-attribution')),
        findsOneWidget,
      );

      await tester.tap(find.text('Jericoacoara'));
      await tester.pumpAndSettle();

      expect(service.resolveCalls, 1);
      expect(service.lastSuggestionToken, service.sessionToken);
      expect(service.lastResolveToken, service.sessionToken);
      expect(find.text('Selecionado: Jericoacoara'), findsOneWidget);
    },
  );
}

class _AutocompleteHost extends StatefulWidget {
  const _AutocompleteHost({required this.service});

  final _FakeAutocompleteService service;

  @override
  State<_AutocompleteHost> createState() => _AutocompleteHostState();
}

class _AutocompleteHostState extends State<_AutocompleteHost> {
  String? _selected;

  Future<void> _open() async {
    final place = await Navigator.of(context).push<RamoPlace>(
      MaterialPageRoute(
        builder: (_) => DestinationSearchScreen(
          searchService: widget.service,
          autocompleteService: widget.service,
        ),
      ),
    );
    if (!mounted || place == null) return;
    setState(() => _selected = place.name);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          ElevatedButton(
            key: const Key('open-search'),
            onPressed: _open,
            child: const Text('Abrir busca'),
          ),
          if (_selected != null) Text('Selecionado: $_selected'),
        ],
      ),
    );
  }
}

class _FakeAutocompleteService
    implements PlaceSearchService, PlaceAutocompleteService {
  final sessionToken = '3519edfe-0f75-4a30-bfe4-7cbd89340b2c';

  int suggestionCalls = 0;
  int resolveCalls = 0;
  int manualSearchCalls = 0;
  String? lastSuggestionToken;
  String? lastResolveToken;

  @override
  String beginSession() => sessionToken;

  @override
  Future<List<PlaceAutocompleteSuggestion>> suggestions(
    String query, {
    required String sessionToken,
  }) async {
    suggestionCalls += 1;
    lastSuggestionToken = sessionToken;
    return const [
      PlaceAutocompleteSuggestion(
        placeId: 'jeri-place',
        mainText: 'Jericoacoara',
        secondaryText: 'Jijoca de Jericoacoara - CE',
        localOnly: true,
      ),
    ];
  }

  @override
  Future<RamoPlace> resolve(
    PlaceAutocompleteSuggestion suggestion, {
    required String sessionToken,
  }) async {
    resolveCalls += 1;
    lastResolveToken = sessionToken;
    return const RamoPlace(
      name: 'Jericoacoara',
      address: 'Jericoacoara, Jijoca de Jericoacoara - CE',
      position: LatLng(-2.7956, -40.5142),
    );
  }

  @override
  Future<List<RamoPlace>> search(String query) async {
    manualSearchCalls += 1;
    return const [];
  }
}
