import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/http_pricing_quote_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_policy_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_quote_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/managed_pricing_catalog.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_ride_preparation_service.dart';

const origin = RamoPlace(name: 'Minha localização', address: 'Origem de teste',
  position: LatLng(-2.82017, -40.41467),
  approvedPricingZoneId: 'prea', approvedPricingLocalityId: 'legacy-prea');
const route = RouteInfo(points: [], distanceMeters: 14000, duration: Duration(minutes: 25));
const token = 'native-passenger-contract-session';
Map<String, Object> policy() => {
  'managementMode': 'managed', 'enabledCategories': ['car', 'moto'],
  'enabledZones': ['external'], 'buggy': {'minPassengers': 1, 'maxPassengers': 4},
  'regions': [
    {'id': 'managed-pickup', 'name': 'Origem ADM', 'enabled': true, 'archived': false, 'categoryIds': ['car']},
    {'id': 'managed-dropoff', 'name': 'Destino ADM', 'enabled': true, 'archived': false, 'categoryIds': ['car', 'moto']},
  ],
  'categories': [{'id': 'car', 'name': 'Carro cadastrado'}],
  'localityGeofences': [
    {'zoneId': 'external', 'localityId': 'managed-pickup', 'centerLatitude': -2.82017, 'centerLongitude': -40.41467, 'radiusKm': 1},
    {'zoneId': 'external', 'localityId': 'managed-dropoff', 'centerLatitude': -2.89860, 'centerLongitude': -40.45060, 'radiusKm': 1},
  ],
};

void main() {
  tearDown(() => ManagedPricingCatalog.update(enabled: false, zones: null, categories: null));

  test('published ADM regions, business selection, authenticated quote and ride preparation share coordinates and names', () async {
    final calls = <String>[];
    String? searchSession;
    final base = Uri.parse('https://core.example.invalid');
    final client = MockClient((request) async {
      calls.add(request.url.path);
      if (request.url.path == '/v1/pricing/policy') {
        return http.Response(jsonEncode(policy()), 200);
      }
      expect(request.headers['authorization'], 'Bearer $token');
      final b = jsonDecode(request.body) as Map<String, dynamic>;
      switch (request.url.path) {
        case '/v1/maps/places/autocomplete':
          expect(b['input'], 'Café de teste');
          expect(b['searchMode'], 'google');
          searchSession = b['sessionToken'] as String;
          return http.Response(jsonEncode({'suggestions': [
            {'placeId': 'business-id', 'mainText': 'Café de teste', 'secondaryText': 'Endereço de teste'},
          ]}), 200);
        case '/v1/maps/places/details':
          expect(b['placeId'], 'business-id');
          expect(b['searchMode'], 'google');
          expect(b['sessionToken'], searchSession);
          return http.Response(jsonEncode({'place': {
            'id': 'business-id', 'name': 'Café de teste', 'address': 'Endereço de teste',
            'latitude': -2.89860, 'longitude': -40.45060,
            'approvedPricingZoneId': 'external', 'approvedPricingLocalityId': 'managed-dropoff',
            'placeProof': 'signed-fixture-place-proof',
          }}), 200);
        case '/v1/pricing/quote':
        case '/v1/rides/prepare':
          expect(b['pickup'], {'latitude': -2.82017, 'longitude': -40.41467});
          expect(b['dropoff'], {'latitude': -2.89860, 'longitude': -40.45060});
          final q = (b['quoteRequest'] ?? b) as Map<String, dynamic>;
          expect(q['origin'], {'zoneId': 'external', 'localityId': 'managed-pickup'});
          expect(q['destination'], {'zoneId': 'external', 'localityId': 'managed-dropoff'});
          expect(q['category'], 'car');
          if (request.url.path == '/v1/pricing/quote') {
            return http.Response(jsonEncode({'kind': 'exact', 'ruleId': 'server-fare', 'totalAmountCents': 12345}), 200);
          }
          expect(b['dropoffLabel'], 'Café de teste');
          expect(b['dropoffPlaceProof'], 'signed-fixture-place-proof');
          return http.Response(jsonEncode({'ride': {
            'id': 'prepared-fixture', 'state': 'AWAITING_PAYMENT',
            'quote': {'baseAmountCents': 12345, 'pickupCompensationCents': 0, 'totalAmountCents': 12345},
          }, 'paymentExpiresAt': '2030-01-01T00:00:00Z'}), 201);
        default:
          fail('Unexpected request: ${request.url.path}');
      }
    });
    final published = await HttpPricingPolicyService(baseUrl: base, client: client).load();
    expect(published.usesManagedRegions, isTrue);
    expect(published.managedCategoriesForTrip('managed-pickup', 'managed-dropoff'), {'car'});
    final search = CorePlaceSearchService(baseUrl: base, accessToken: token, client: client);
    final session = search.beginSession();
    final suggestion = (await search.suggestions('Café de teste', sessionToken: session)).single;
    final destination = await search.resolve(suggestion, sessionToken: session);
    final quote = await HttpPricingQuoteService(baseUrl: base, accessToken: token, client: client).quote(
      service: ServiceType.car, origin: origin, destination: destination,
      originZoneId: 'prea', destinationZoneId: 'jijoca', route: route);
    expect(quote.isExact, isTrue);expect(quote.totalAmountCents, 12345);
    final prepared = await HttpRidePreparationService(baseUrl: base, accessToken: token, client: client).prepare(
      service: ServiceType.car, origin: origin, destination: destination,
      originZoneId: 'prea', destinationZoneId: 'jijoca', route: route);
    expect(prepared.id, 'prepared-fixture');expect(prepared.totalAmountCents, quote.totalAmountCents);
    expect(calls, ['/v1/pricing/policy', '/v1/maps/places/autocomplete', '/v1/maps/places/details', '/v1/pricing/quote', '/v1/rides/prepare']);
    client.close();
  });

  for (final entry in {401: 'UNAUTHORIZED', 422: 'UNKNOWN_ROUTE'}.entries) {
    test('a server rejection ${entry.key} never becomes a locally invented price', () async {
      final service = HttpPricingQuoteService(baseUrl: Uri.parse('https://core.example.invalid'), accessToken: token,
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer $token');
          return http.Response(jsonEncode({'error': entry.value, 'message': 'Cotação recusada'}), entry.key);
        }));
      await expectLater(service.quote(service: ServiceType.car, origin: origin, destination: origin,
        originZoneId: 'prea', destinationZoneId: 'prea', route: route),
        throwsA(isA<PricingQuoteException>().having((e) => e.code, 'code', entry.value)));
    });
  }
}
