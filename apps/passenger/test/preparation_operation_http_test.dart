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
import 'package:ramo_nessa_passenger/src/features/rides/data/expandable_ride_preparation_service.dart';

const origin = RamoPlace(name: 'Preá', address: 'Preá', position: LatLng(-2.82017, -40.41467));
const destination = RamoPlace(name: 'Jijoca', address: 'Jijoca', position: LatLng(-2.89860, -40.45060));
const route = RouteInfo(points: [LatLng(-2.82017, -40.41467), LatLng(-2.89860, -40.45060)],
  distanceMeters: 12000, duration: Duration(minutes: 20));
const input = RideSearchRequest(service: ServiceType.car, origin: origin,
  destination: destination, originZoneId: 'prea', destinationZoneId: 'jijoca', route: route);
Future<void> prepare(HttpRidePreparationService service, {DateTime? now}) async {
  await service.prepare(service: ServiceType.car, origin: origin, destination: destination,
    originZoneId: 'prea', destinationZoneId: 'jijoca', route: route, now: now);
}
http.Response success() => http.Response(jsonEncode({
  'ride': {'id': 'same-ride', 'state': 'AWAITING_PAYMENT',
    'quote': {'baseAmountCents': 12000, 'pickupCompensationCents': 500, 'totalAmountCents': 12500},
    'paymentExpiresAt': '2030-01-01T22:10:00Z'},
}), 201);

void main() {
  late List<http.Request> requests;
  setUp(() => requests = []);
  HttpRidePreparationService create({bool enabled = true, Future<http.Response> Function(http.Request)? reply}) =>
    HttpRidePreparationService(baseUrl: Uri.parse('https://core.test'),
      accessToken: 'synthetic-only-token-abcdefghijklmnopqrstuvwxyz', replayEnabled: enabled,
      client: MockClient((request) async { requests.add(request); return reply == null ? success() : await reply(request); }));

  test('unchanged retry keeps the same key and exact request across 22:00', () async {
    final service = create();
    await prepare(service, now: DateTime(2026, 10, 30, 21, 59));
    await prepare(service, now: DateTime(2026, 10, 30, 22, 1));
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
    expect(requests[1].body, requests[0].body);
  });
  test('a new explicit search uses another key for the same route', () async {
    final service = create();
    await prepare(service);
    await prepare(service.forNewIntent());
    expect(requests[1].headers['idempotency-key'], isNot(requests[0].headers['idempotency-key']));
  });
  test('lost HTTP response retains the key rather than silently creating a new attempt', () async {
    var first = true;
    final service = create(reply: (_) async {
      if (first) { first = false; throw http.ClientException('Synthetic lost response'); }
      return success();
    });
    await expectLater(prepare(service), throwsA(isA<http.ClientException>()));
    await prepare(service);
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
    expect(requests[1].body, requests[0].body);
  });
  test('an inconclusive server error keeps the existing attempt', () async {
    final service = create(reply: (_) async => http.Response('{"error":"ROUTING_UNAVAILABLE"}', 503));
    await expectLater(prepare(service), throwsA(isA<RidePreparationException>()));
    await expectLater(prepare(service), throwsA(isA<RidePreparationException>()));
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
  });
  test('definitive server results permit another explicit search without reviving the old identifier', () async {
    for (final code in ['NO_ELIGIBLE_DRIVER', 'PREPARATION_EXPIRED', 'PREPARATION_ALREADY_ADVANCED']) {
      var first = true;
      final service = create(reply: (_) async {
        if (first) { first = false; return http.Response(jsonEncode({'error': code}), 409); }
        return success();
      });
      await expectLater(prepare(service), throwsA(isA<RidePreparationException>()));
      final previous = requests.last.headers['idempotency-key'];
      await prepare(service);
      expect(requests.last.headers['idempotency-key'], isNot(previous));
    }
  });
  test('explicit radius change is distinct but retry of that radius stays the same', () async {
    final service = create();
    await prepare(service);
    await service.prepareWithRadius(input, 15);
    await service.prepareWithRadius(input, 15);
    expect(requests[1].headers['idempotency-key'], isNot(requests[0].headers['idempotency-key']));
    expect(requests[2].headers['idempotency-key'], requests[1].headers['idempotency-key']);
    expect(requests[2].body, requests[1].body);
  });
  test('disabled flag retains the original header behavior', () async {
    await prepare(create(enabled: false));
    expect(requests.single.headers.containsKey('idempotency-key'), false);
  });
  test('only reservation preparation is submitted by this protection', () async {
    final service = create();
    await prepare(service);
    await prepare(service);
    expect(requests.every((r) => r.method == 'POST' && r.url.path == '/v1/rides/prepare'), true);
  });
}
