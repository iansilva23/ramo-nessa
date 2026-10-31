import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/core/communications/agency_promotion_service.dart';
import 'package:ramo_nessa_passenger/src/core/communications/app_release_policy_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_saved_place_service.dart';
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

class NoRelease implements AppReleasePolicyService {
  @override
  Future<AppReleasePolicy> check({required String appKind, required String platform, required int buildNumber}) async => throw StateError('Release checks disabled in isolated map test');
}

class NoAgency implements AgencyPromotionService {
  @override
  Future<AgencyPromotion> load() async => throw StateError('Optional content disabled in isolated map test');
}

class DelayedLocation implements LocationService {
  final response = Completer<LatLng>();
  @override
  Future<LatLng> getCurrentLocation() => response.future;
}
class NoSearch implements PlaceSearchService {
  @override
  Future<List<RamoPlace>> search(String query) async => [];
}
class DelayedResolver extends NoSearch implements CoordinatePlaceResolver {
  final response = Completer<RamoPlace?>();
  @override
  Future<RamoPlace?> classifyCoordinate(LatLng point) => response.future;
}
class SavedStore extends Fake implements PassengerSavedPlaceService {
  @override
  Future<List<PassengerSavedPlace>> list() async => [PassengerSavedPlace(
    id: 'saved', kind: 'home', label: 'Casa de teste', name: 'Casa salva', address: 'Endereço sintético',
    position: pickup.position, addressDetails: const {'mapPinned': true},
    createdAt: DateTime(2026), updatedAt: DateTime(2026))];
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
  if (kIsWeb) {
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint('WEB_PICK_FRAMEWORK_ERROR: ${details.exceptionAsString()}\n${details.stack}');
      previous?.call(details);
    };
    addTearDown(() => FlutterError.onError = previous);
  }
  Future<void> visible(Finder finder) async {
    for (var frame = 0; frame < 30 && finder.evaluate().isEmpty; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(finder, findsOneWidget);
  }
  await visible(find.byType(RideBottomSheet));
  final card = tester.widget<RideBottomSheet>(find.byType(RideBottomSheet));
  if (origin) { card.onOriginTap(); } else { card.onDestinationTap(); }
  await tester.pump();
  await visible(find.byType(DestinationSearchScreen));
  final search = tester.element(find.byType(DestinationSearchScreen));
  final route = ModalRoute.of(search)!;
  await tester.pump(route.transitionDuration);
  Navigator.of(search).pop(place);
  await tester.pump();
  // Use the actual theme transition duration, not an assumed 350 ms. Recent
  // Material transitions can last longer; zero-duration pumps do not finish it.
  await tester.pump(route.reverseTransitionDuration);
  await tester.pump();
  await tester.pump();
  await tester.pump();
  for (var frame = 0; frame < 30 && find.byType(DestinationSearchScreen).evaluate().isNotEmpty; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(find.byType(DestinationSearchScreen), findsNothing);
  await visible(find.byType(RamoLiveMap));
  await tester.pump();
}

void main() {
  setUp(() {
    if (!kIsWeb) return;
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint('WEB_SELECTION_FRAMEWORK_ERROR: ${details.exceptionAsString()}');
      previous?.call(details);
    };
    addTearDown(() => FlutterError.onError = previous);
  });
  testWidgets('Web waits for search transition before applying the selected route', (tester) async {
    if (!kIsWeb) return;
    final previousErrorHandler = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint('WEB_RETURN_FRAMEWORK_ERROR: ${details.exceptionAsString()}');
      previousErrorHandler?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousErrorHandler);
    final location = DelayedLocation();
    final routes = RecordingRoutes();
    await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
      releasePolicyService: NoRelease(), agencyPromotionService: NoAgency(),
      locationService: location, routeService: routes, placeSearchService: NoSearch(),
      pricingPolicyService: ControlledPolicy(), networkTilesEnabled: false,
    )));
    location.response.complete(pickup.position);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    tester.widget<RideBottomSheet>(find.byType(RideBottomSheet)).onDestinationTap();
    await tester.pumpAndSettle();
    final search = tester.element(find.byType(DestinationSearchScreen));
    final searchRoute = ModalRoute.of(search)!;
    Navigator.of(search).pop(firstDestination);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(searchRoute.animation!.status, AnimationStatus.reverse);
    expect(routes.destinations, isEmpty,
      reason: 'WEB_ROUTE_MUST_WAIT_FOR_SEARCH_TRANSITION');
    await tester.pumpAndSettle();
    expect(routes.destinations, [firstDestination.position]);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap)).destination?.name, firstDestination.name);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
  testWidgets('late coordinate classification cannot replace the chosen Web origin', (tester) async {
    if (!kIsWeb) return;
    final location = DelayedLocation();
    final resolver = DelayedResolver();
    await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
      releasePolicyService: NoRelease(), agencyPromotionService: NoAgency(), locationService: location, placeSearchService: resolver,
      pricingPolicyService: ControlledPolicy(), networkTilesEnabled: false,
    )));
    location.response.complete(const LatLng(-2.9, -40.45));
    await tester.pump();
    await pick(tester, pickup, origin: true);
    resolver.response.complete(firstDestination);
    await tester.pump();
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap)).origin?.name, pickup.name);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  testWidgets('late saved address validation cannot close a newer Web search', (tester) async {
    if (!kIsWeb) return;
    final resolver = DelayedResolver();
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => DestinationSearchScreen(searchService: resolver, savedPlaceService: SavedStore()))),
        child: const Text('Abrir busca'))))));
    await tester.tap(find.text('Abrir busca'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Meus endereços'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Casa de teste'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Outro destino');
    await tester.pump();
    resolver.response.complete(pickup);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(DestinationSearchScreen), findsOneWidget);
    expect(find.text('Outro destino'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
  testWidgets('late Web GPS cannot replace an origin selected in the actual screen', (tester) async {
    if (!kIsWeb) return;
    final location = DelayedLocation();
    await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
      releasePolicyService: NoRelease(), agencyPromotionService: NoAgency(), locationService: location, placeSearchService: NoSearch(),
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
      releasePolicyService: NoRelease(), agencyPromotionService: NoAgency(), locationService: location, routeService: routes, placeSearchService: NoSearch(),
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
