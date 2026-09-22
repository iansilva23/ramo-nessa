import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/app.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/destination_search_screen.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/route_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';

void main() {
  testWidgets('digitar destino não faz autocomplete no Nominatim', (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      MaterialApp(
        home: DestinationSearchScreen(searchService: search),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Jericoacoara');
    await tester.pump(const Duration(seconds: 2));

    expect(search.calls, 0);

    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(search.calls, 1);
    expect(find.widgetWithText(ListTile, 'Jericoacoara'), findsOneWidget);
  });

  testWidgets('rota real calcula preço e matching fake continua bloqueado',
      (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: _FakeRouteService(),
        placeSearchService: search,
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Minha localização'), findsOneWidget);

    await tester.tap(find.text('Pra onde vamos?'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Jericoacoara');
    await tester.pump();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ListTile, 'Jericoacoara'));
    await tester.pumpAndSettle();

    expect(find.textContaining('2,5 km · 7 min'), findsOneWidget);

    await tester.drag(
      find.byType(ListView).last,
      const Offset(0, -260),
    );
    await tester.pumpAndSettle();

    expect(find.text('R\$ 16,00'), findsOneWidget);
    expect(find.text('estimativa pela rota'), findsOneWidget);

    await tester.tap(find.text('Solicitar'));
    await tester.pump();

    expect(
      find.textContaining('O matching com motoristas será conectado'),
      findsOneWidget,
    );
    expect(find.textContaining('Procurando carro'), findsNothing);
  });

  testWidgets('passageiro consegue trocar a origem manualmente', (tester) async {
    final search = _FakePlaceSearchService();
    final route = _FakeRouteService();

    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: route,
        placeSearchService: search,
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Minha localização'));
    await tester.pumpAndSettle();

    expect(find.text('Escolher origem'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Preá');
    await tester.pump();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ListTile, 'Preá'));
    await tester.pumpAndSettle();

    expect(find.text('Preá'), findsOneWidget);
  });
}

class _FakeLocationService implements LocationService {
  @override
  Future<LatLng> getCurrentLocation() async {
    return const LatLng(-2.7956, -40.5142);
  }
}

class _FakeRouteService implements RouteService {
  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    return RouteInfo(
      points: [origin, destination],
      distanceMeters: 2500,
      duration: const Duration(minutes: 7),
    );
  }
}

class _FakePlaceSearchService implements PlaceSearchService {
  int calls = 0;

  @override
  Future<List<RamoPlace>> search(String query) async {
    calls++;

    if (query.toLowerCase().contains('pre')) {
      return const [
        RamoPlace(
          name: 'Preá',
          address: 'Preá, Cruz, Ceará, Brasil',
          position: LatLng(-2.82017, -40.41467),
        ),
      ];
    }

    return const [
      RamoPlace(
        name: 'Jericoacoara',
        address: 'Jericoacoara, Ceará, Brasil',
        position: LatLng(-2.7956, -40.5142),
      ),
    ];
  }
}
