import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_autocomplete_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/managed_pricing_catalog.dart';

void main() {
  setUp(() => ManagedPricingCatalog.update(enabled: true, zones: [], categories: []));
  tearDown(() => ManagedPricingCatalog.update(enabled: false, zones: null, categories: null));

  for (final query in ['fortal', 'Fortaleza', 'Fortaleza CE', 'hotel', 'aeroporto', 'Caiçara']) {
    test('Google primary preserves query $query and provider ordering', () async {
      Map<String, dynamic>? sent;
      final service = CorePlaceSearchService(baseUrl: Uri.parse('https://example.invalid'),
        client: MockClient((request) async {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(jsonEncode({'suggestions': [
            {'placeId': 'city-id', 'mainText': 'Fortaleza', 'secondaryText': 'CE'},
            {'placeId': 'hotel-id', 'mainText': 'Hotel Centro', 'secondaryText': 'Fortaleza CE'},
          ]}), 200);
        }));
      final session = service.beginSession();
      final suggestions = await service.suggestions(query, sessionToken: session);
      expect(sent!['input'], query, reason: 'GOOGLE_PRIMARY_MUST_KEEP_QUERY');
      expect(sent!['searchMode'], 'google');
      expect(sent!['sessionToken'], session);
      expect(suggestions.map((s) => s.placeId), ['city-id', 'hotel-id']);
      expect(suggestions.every((s) => s.approvedExternalId == null), isTrue);
    });
  }

  test('managed details do not reject a hotel by old city label or identifier', () async {
    final service = CorePlaceSearchService(baseUrl: Uri.parse('https://example.invalid'),
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['searchMode'], 'google');
        return http.Response(jsonEncode({'place': {
          'id': 'hotel-id', 'name': 'Hotel Centro', 'address': 'Rua teste CE',
          'latitude': -3.82428, 'longitude': -38.55410,
          'approvedPricingZoneId': 'external',
          'approvedPricingLocalityId': 'region-generated-fortaleza',
          'placeProof': 'synthetic-proof',
        }}), 200);
      }));
    final place = await service.resolve(const PlaceAutocompleteSuggestion(
      placeId: 'hotel-id', mainText: 'Hotel Centro', secondaryText: '',
      localOnly: false, approvedExternalId: 'fortaleza'), sessionToken: service.beginSession());
    expect(place.approvedPricingLocalityId, 'region-generated-fortaleza');
    expect(place.approvedExternalId, isNull);
    expect(place.placeProof, 'synthetic-proof');
  });

  test('manual managed Google results stay fresh and keep generated region references', () async {
    var calls = 0;
    final service = CorePlaceSearchService(baseUrl: Uri.parse('https://example.invalid'),
      client: MockClient((request) async {
        calls++;
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['query'], 'Fortaleza');
        expect(body['searchMode'], 'google');
        return http.Response(jsonEncode({'places': [{
          'id': 'hotel-$calls', 'name': 'Hotel Centro', 'address': 'Rua teste CE',
          'latitude': -3.82428, 'longitude': -38.55410,
          'approvedPricingZoneId': 'external',
          'approvedPricingLocalityId': 'region-generated-fortaleza',
          'placeProof': 'synthetic-proof-$calls',
        }]}), 200);
      }));
    final first = await service.search('Fortaleza');
    final second = await service.search('Fortaleza');
    expect(calls, 2);
    expect(first.single.approvedPricingLocalityId, 'region-generated-fortaleza');
    expect(second.single.placeProof, 'synthetic-proof-2');
  });

  test('legacy catalog preserves aliases without enabling managed Google search', () async {
    ManagedPricingCatalog.update(enabled: false, zones: null, categories: null);
    final service = CorePlaceSearchService(baseUrl: Uri.parse('https://example.invalid'),
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body.containsKey('searchMode'), isFalse);
        expect(body['input'], 'Fortaleza, Ceará, Brasil');
        return http.Response('{"suggestions":[]}', 200);
      }));
    await service.suggestions('fortal', sessionToken: service.beginSession());
  });
}
