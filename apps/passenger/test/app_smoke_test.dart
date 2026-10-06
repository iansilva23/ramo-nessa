import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/app.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_home_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_main_shell.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/route_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/preview/passenger_preview_dependencies.dart';

void main() {
  testWidgets('home renderiza com mapa isolado de rede', (tester) async {
    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: _FakeRouteService(),
        placeSearchService: _FakePlaceSearchService(),
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));

    expect(tester.takeException(), isNull);
    expect(find.text('RAMO NESSA'), findsOneWidget);
    expect(find.text('Pra onde vamos?'), findsOneWidget);
    expect(find.text('© OpenStreetMap contributors'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();

    expect(tester.takeException(), isNull);
  });

  testWidgets('home e perfil recebem o mesmo serviço de pagamentos',
      (tester) async {
    final payments = PassengerPreviewDependencies().payments;
    await tester.pumpWidget(RamoNessaPassengerApp(
      paymentService: payments,
      locationService: _FakeLocationService(),
      routeService: _FakeRouteService(),
      placeSearchService: _FakePlaceSearchService(),
      networkTilesEnabled: false,
    ));
    await tester.pump();
    expect(tester.widget<PassengerMainShell>(find.byType(PassengerMainShell))
        .paymentService, same(payments));
    expect(tester.widget<PassengerHomeScreen>(find.byType(PassengerHomeScreen))
        .paymentService, same(payments));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(tester.takeException(), isNull);
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
  @override
  Future<List<RamoPlace>> search(String query) async => const [];
}
