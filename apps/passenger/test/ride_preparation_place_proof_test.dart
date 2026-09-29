import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_ride_preparation_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/ride_preparation_service.dart';

void main() {
  test('preparação envia prova assinada de localidade local ao Core', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'error': 'TEST_STOP',
          'message': 'fixture encerra após validar o request',
        }),
        422,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpRidePreparationService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-proof-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    const origin = RamoPlace(
      name: 'Preá',
      address: 'Preá, Cruz - CE',
      position: LatLng(-2.82017, -40.41467),
    );
    const destination = RamoPlace(
      name: 'Aranaú',
      address: 'Aranaú, Acaraú - CE',
      position: LatLng(-3.0, -40.2),
      approvedPricingZoneId: 'prea',
      approvedPricingLocalityId: 'aranau',
      providerPlaceId: 'google-place-aranau',
      placeProof: 'signed-local-place-proof-aranau-abcdefghijklmnopqrstuvwxyz',
    );
    const route = RouteInfo(
      points: [
        LatLng(-2.82017, -40.41467),
        LatLng(-3.0, -40.2),
      ],
      distanceMeters: 30000,
      duration: Duration(minutes: 45),
    );

    await expectLater(
      service.prepare(
        service: ServiceType.car,
        origin: origin,
        destination: destination,
        originZoneId: 'prea',
        destinationZoneId: 'prea',
        route: route,
      ),
      throwsA(isA<RidePreparationException>()),
    );

    final body = jsonDecode(captured.body) as Map<String, dynamic>;
    expect(
      body['dropoffPlaceProof'],
      'signed-local-place-proof-aranau-abcdefghijklmnopqrstuvwxyz',
    );
    expect(
      (body['quoteRequest'] as Map<String, dynamic>)['destination'],
      {
        'zoneId': 'prea',
        'localityId': 'aranau',
      },
    );
  });

  test('preparação envia prova assinada de destino externo ao Core', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'error': 'TEST_STOP',
          'message': 'fixture encerra após validar o request',
        }),
        422,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpRidePreparationService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-proof-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    const origin = RamoPlace(
      name: 'Preá',
      address: 'Preá, Cruz - CE',
      position: LatLng(-2.82017, -40.41467),
    );
    const destination = RamoPlace(
      name: 'Sobral',
      address: 'Sobral - CE, Brasil',
      position: LatLng(-3.6880, -40.3499),
      approvedExternalId: 'sobral',
      providerPlaceId: 'google-place-sobral',
      placeProof: 'signed-place-proof-sobral-abcdefghijklmnopqrstuvwxyz',
    );
    const route = RouteInfo(
      points: [
        LatLng(-2.82017, -40.41467),
        LatLng(-3.6880, -40.3499),
      ],
      distanceMeters: 120000,
      duration: Duration(hours: 2),
    );

    await expectLater(
      service.prepare(
        service: ServiceType.car,
        origin: origin,
        destination: destination,
        originZoneId: 'prea',
        destinationZoneId: 'external',
        route: route,
      ),
      throwsA(isA<RidePreparationException>()),
    );

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/rides/prepare');
    final body = jsonDecode(captured.body) as Map<String, dynamic>;
    expect(
      body['dropoffPlaceProof'],
      'signed-place-proof-sobral-abcdefghijklmnopqrstuvwxyz',
    );
    expect(
      (body['quoteRequest'] as Map<String, dynamic>)['destination'],
      {
        'zoneId': 'external',
        'localityId': 'sobral',
      },
    );
  });
}
