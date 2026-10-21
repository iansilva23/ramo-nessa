import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_home_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/vehicle_selection_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_policy_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_quote_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/managed_pricing_catalog.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/pricing_quote.dart';
import 'web_map_selection_race_test.dart'
    show NoRelease, NoAgency, NoSearch, DelayedLocation, RecordingRoutes, pick;

const jeri = RamoPlace(name: 'Jeri fixture', address: '',
  position: LatLng(-2.80023, -40.51638));
const destinations = [
  RamoPlace(name: 'Fortaleza fixture', address: '',
    position: LatLng(-3.82428, -38.55410), placeProof: 'synthetic-proof'),
  RamoPlace(name: 'Aeroporto fixture', address: '',
    position: LatLng(-2.90624, -40.35776), placeProof: 'synthetic-proof'),
  RamoPlace(name: 'Nova localidade sem alias', address: '',
    position: LatLng(-3.2, -40.7), placeProof: 'synthetic-proof'),
];

Map<String, dynamic> policyJson({bool allowDestination = true}) => {
  'managementMode': 'managed',
  'enabledCategories': ['comfort_black', 'moto'],
  'enabledZones': ['jericoacoara', 'external'],
  'buggy': {'minPassengers': 1, 'maxPassengers': 4},
  'categories': [
    {'id': 'comfort_black', 'name': '4x4 fixture'},
    {'id': 'moto', 'name': 'Moto fixture'},
  ],
  'regions': [
    {'id': 'jericoacoara', 'name': jeri.name, 'enabled': true, 'archived': false,
      'categoryIds': ['comfort_black']},
    for (var i = 0; i < destinations.length; i++)
      {'id': 'region-generated-$i', 'name': destinations[i].name,
        'enabled': true, 'archived': false,
        'categoryIds': allowDestination ? ['comfort_black', 'moto'] : ['moto']},
  ],
  'localityGeofences': [
    {'zoneId': 'jericoacoara', 'localityId': 'jericoacoara',
      'centerLatitude': jeri.position.latitude,
      'centerLongitude': jeri.position.longitude, 'radiusKm': 1},
    for (var i = 0; i < destinations.length; i++)
      {'zoneId': 'external', 'localityId': 'region-generated-$i',
        'centerLatitude': destinations[i].position.latitude,
        'centerLongitude': destinations[i].position.longitude, 'radiusKm': 1},
  ],
};

class CatalogPolicy implements PricingPolicyService {
  CatalogPolicy({this.allowDestination = true});
  final bool allowDestination;
  @override
  Future<PassengerPricingPolicy> load() async =>
      PassengerPricingPolicy.fromJson(policyJson(allowDestination: allowDestination));
}

class RecordingQuotes implements PricingQuoteService {
  RecordingQuotes({this.hasFare = true});
  final bool hasFare;
  final categories = <ServiceType>[];
  @override
  Future<PricingQuote> quote({required ServiceType service,
    required RamoPlace origin, required RamoPlace destination,
    required String originZoneId, required String destinationZoneId,
    required RouteInfo route, int passengers = 1, DateTime? now}) async {
    categories.add(service);
    if (!hasFare) throw const PricingQuoteException('Sem tarifa', code: 'UNKNOWN_ROUTE');
    return PricingQuote.fromJson({'kind': 'exact', 'ruleId': 'synthetic-only',
      'totalAmountCents': 12345});
  }
}

Future<RecordingRoutes> openTrip(WidgetTester tester, RamoPlace origin,
    RamoPlace destination, RecordingQuotes quotes, {bool allowDestination = true}) async {
  final location = DelayedLocation();
  final routes = RecordingRoutes();
  await tester.pumpWidget(MaterialApp(home: PassengerHomeScreen(
    releasePolicyService: NoRelease(), agencyPromotionService: NoAgency(),
    locationService: location, routeService: routes, placeSearchService: NoSearch(),
    pricingPolicyService: CatalogPolicy(allowDestination: allowDestination),
    pricingQuoteService: quotes, networkTilesEnabled: false,
  )));
  location.response.complete(origin.position);
  await tester.pump();
  await pick(tester, origin, origin: true);
  await pick(tester, destination);
  await tester.pumpAndSettle();
  return routes;
}

void main() {
  tearDown(() => ManagedPricingCatalog.update(enabled: false, zones: null, categories: null));

  test('managed category permissions fail closed and native stays on previous rollout', () {
    final json = policyJson();
    final regions = json['regions'] as List;
    regions.addAll([
      {'id': 'disabled', 'enabled': false, 'archived': false, 'categoryIds': ['comfort_black']},
      {'id': 'archived', 'enabled': true, 'archived': true, 'categoryIds': ['comfort_black']},
    ]);
    final policy = PassengerPricingPolicy.fromJson(json);
    expect(policy.usesManagedRegions, kIsWeb);
    expect(policy.managedCategoriesForTrip('jericoacoara', 'region-generated-0'),
      kIsWeb ? {'comfort_black'} : isEmpty);
    for (final id in ['disabled', 'archived', 'unknown']) {
      expect(policy.managedCategoriesForTrip('jericoacoara', id), isEmpty);
    }
    json['enabledCategories'] = ['moto'];
    expect(PassengerPricingPolicy.fromJson(json)
      .managedCategoriesForTrip('jericoacoara', 'region-generated-0'), isEmpty);
    json['managementMode'] = 'legacy';
    expect(PassengerPricingPolicy.fromJson(json).usesManagedRegions, isFalse);
  });

  for (final destination in destinations) {
    for (final reverse in [false, true]) {
      testWidgets('managed route ${destination.name}, reverse=$reverse reaches authoritative quote', (tester) async {
        if (!kIsWeb) return;
        final quotes = RecordingQuotes();
        final routes = await openTrip(tester,
          reverse ? destination : jeri, reverse ? jeri : destination, quotes);
        expect(routes.destinations, isNotEmpty,
          reason: 'MANAGED_GENERATED_REGION_MUST_REACH_ROUTE');
        tester.widget<RideBottomSheet>(find.byType(RideBottomSheet)).onContinue();
        await tester.pumpAndSettle();
        expect(find.byType(VehicleSelectionScreen), findsOneWidget);
        expect(quotes.categories, [ServiceType.comfortBlack]);
        expect(find.text('R\$ 123,45'), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('region without shared category never requests a route or quote', (tester) async {
    if (!kIsWeb) return;
    final quotes = RecordingQuotes();
    final routes = await openTrip(tester, jeri, destinations.first, quotes, allowDestination: false);
    expect(routes.destinations, isEmpty);
    expect(quotes.categories, isEmpty);
    expect(find.text('Essa rota ainda não tem serviço configurado.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('server rejects absent fare and cannot enable ride confirmation', (tester) async {
    if (!kIsWeb) return;
    final quotes = RecordingQuotes(hasFare: false);
    await openTrip(tester, jeri, destinations.first, quotes);
    tester.widget<RideBottomSheet>(find.byType(RideBottomSheet)).onContinue();
    await tester.pumpAndSettle();
    expect(quotes.categories, [ServiceType.comfortBlack]);
    expect(find.byType(VehicleSelectionScreen), findsOneWidget);
    expect(find.text('R\$ 123,45'), findsNothing);
    final buttons = tester.widgetList<FilledButton>(find.byType(FilledButton));
    expect(buttons, isNotEmpty);
    expect(buttons.every((button) => button.onPressed == null), isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}
