import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_home_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/destination_search_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/route_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_policy_service.dart';

const pickup = RamoPlace(name: 'Origem escolhida', address: '', position: LatLng(-2.82017, -40.41467));
const firstDestination = RamoPlace(name: 'Primeiro destino', address: '', position: LatLng(-2.89860, -40.45060));
const latestDestination = RamoPlace(name: 'Destino atual', address: '', position: LatLng(-2.80023, -40.51638));
const policy = PassengerPricingPolicy(enabledCategories: {'car'}, enabledZones: {'prea', 'jijoca', 'jericoacoara'}, buggyMinPassengers: 1, buggyMaxPassengers: 4);

class DelayedLocation implements LocationService {
  final response = Completer<LatLng>();
  @override
  Future<LatLng> getCurrentLocation() => response.future;
}
class NoSearch implements PlaceSearchService {
  @override
  Future<List<RamoPlace>> search(String query) async => [];
}
class ControlledPolicy implements PricingPolicyService {
  Completer<PassengerPricingPolicy>? delayed;
  @override
  Future<PassengerPricingPolicy> load() => delayed?.future ?? Future.value(policy);
}
class RecordingRoutes implements RouteService {
  final destinations = <LatLng>[];
  @override
  Future<RouteInfo> route({required LatLng origin, required LatLng destination}) async {
    destinations.add(destination);
    return RouteInfo(points: [origin, destination], distanceMeters: 14000, duration: const Duration(minutes: 30));
  }
}

Future<void> pick(WidgetTester tester, RamoPlace place, {bool origin = false}) async {
  final card = tester.widget<RideBottomSheet>(find.byType(RideBottomSheet));
  if (origin) { card.onOriginTap(); } else { card.onDestinationTap(); }
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  Navigator.of(tester.element(find.byType(DestinationSearchScreen))).pop(place);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
}

void main() {
  testWidgets('late Web GPS cannot replace an origin selected in the actual screen', (tester) async {
    if (!kIsWeb) return;
    final location = DelayedLocation();
    await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
      locationService: location, placeSearchService: NoSearch(),
      pricingPolicyService: ControlledPolicy(), networkTilesEnabled: false,
    )));
    await tester.pump();
    await pick(tester, pickup, origin: true);
    location.response.complete(const LatLng(-2.9, -40.45));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap)).origin?.name, pickup.name);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  testWidgets('delayed policy for old Web destination cannot start a stale route', (tester) async {
    if (!kIsWeb) return;
    final location = DelayedLocation();
    final policies = ControlledPolicy();
    final routes = RecordingRoutes();
    await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
      locationService: location, routeService: routes, placeSearchService: NoSearch(),
      pricingPolicyService: policies, networkTilesEnabled: false,
    )));
    location.response.complete(pickup.position);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    final oldPolicy = policies.delayed = Completer<PassengerPricingPolicy>();
    await pick(tester, firstDestination);
    policies.delayed = null;
    await pick(tester, latestDestination);
    expect(routes.destinations, [latestDestination.position]);
    oldPolicy.complete(policy);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(routes.destinations, [latestDestination.position]);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap)).destination?.name, latestDestination.name);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}
