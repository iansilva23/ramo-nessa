import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_saved_place_service.dart';

void main() {
  test('favorito envia e recupera identidade renovável do lugar', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);

      if (request.method == 'POST') {
        final sent =
            jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'id': '11111111-1111-4111-8111-111111111111',
            'kind': sent['kind'],
            'label': 'Casa',
            'name': sent['name'],
            'address': sent['address'],
            'latitude': sent['latitude'],
            'longitude': sent['longitude'],
            'providerPlaceId': sent['providerPlaceId'],
            'approvedPricingZoneId':
                sent['approvedPricingZoneId'],
            'approvedPricingLocalityId':
                sent['approvedPricingLocalityId'],
            'createdAt': '2026-09-29T12:00:00.000Z',
            'updatedAt': '2026-09-29T12:00:00.000Z',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }

      return http.Response(
        jsonEncode({
          'items': [
            {
              'id': '11111111-1111-4111-8111-111111111111',
              'kind': 'home',
              'label': 'Casa',
              'name': 'Aranaú',
              'address': 'Aranaú, Acaraú - CE',
              'latitude': -2.9,
              'longitude': -40.2,
              'providerPlaceId': 'google-place-aranau',
              'approvedPricingZoneId': 'prea',
              'approvedPricingLocalityId': 'aranau',
              'createdAt': '2026-09-29T12:00:00.000Z',
              'updatedAt': '2026-09-29T12:00:00.000Z',
            }
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerSavedPlaceService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'saved-place-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final saved = await service.save(
      kind: 'home',
      name: 'Aranaú',
      address: 'Aranaú, Acaraú - CE',
      position: const LatLng(-2.9, -40.2),
      providerPlaceId: 'google-place-aranau',
      approvedPricingZoneId: 'prea',
      approvedPricingLocalityId: 'aranau',
    );

    final sent =
        jsonDecode(requests.first.body) as Map<String, dynamic>;
    expect(sent['providerPlaceId'], 'google-place-aranau');
    expect(sent['approvedPricingZoneId'], 'prea');
    expect(sent['approvedPricingLocalityId'], 'aranau');
    expect(saved.providerPlaceId, 'google-place-aranau');
    expect(saved.approvedPricingZoneId, 'prea');
    expect(saved.approvedPricingLocalityId, 'aranau');

    final listed = await service.list();
    expect(listed.single.providerPlaceId, 'google-place-aranau');
    expect(listed.single.approvedPricingLocalityId, 'aranau');
  });
}
