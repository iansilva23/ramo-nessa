import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_ride_preparation_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/preparation_operation_journal.dart';
import 'preparation_operation_journal_test.dart' show MemoryOperations;

const origin = RamoPlace(name: 'Preá', address: 'Preá', position: LatLng(-2.82017, -40.41467));
const destination = RamoPlace(name: 'Jijoca', address: 'Jijoca', position: LatLng(-2.89860, -40.45060));
const route = RouteInfo(points: [LatLng(-2.82017, -40.41467), LatLng(-2.89860, -40.45060)],
  distanceMeters: 12000, duration: Duration(minutes: 20));
const token = 'synthetic-only-auth-token-abcdefghijklmnopqrstuvwxyz';
final core = Uri.parse('https://core.test');
Future<void> prepare(HttpRidePreparationService service, {DateTime? now}) async {
  await service.prepare(service: ServiceType.car, origin: origin, destination: destination,
    originZoneId: 'prea', destinationZoneId: 'jijoca', route: route, now: now);
}
http.Response success() => http.Response(jsonEncode({
  'ride': {'id': 'same-ride', 'state': 'AWAITING_PAYMENT',
    'quote': {'baseAmountCents': 12000, 'pickupCompensationCents': 500, 'totalAmountCents': 12500},
    'paymentExpiresAt': '2026-10-30T22:10:00Z'},
}), 201);

void main() {
  late MemoryOperations storage;
  late PreparationOperationJournal journal;
  late List<http.Request> requests;
  setUp(() {
    storage = MemoryOperations();
    journal = PreparationOperationJournal(storage: storage,
      passengerId: 'passenger-a', coreUri: core);
    requests = [];
  });
  HttpRidePreparationService service({PreparationOperationJournal? store}) =>
    HttpRidePreparationService(baseUrl: core, accessToken: token,
      operationJournal: store,
      client: MockClient((request) async { requests.add(request); return success(); }));

  test('same intent reuses key and exact body across 22:00', () async {
    final client = service(store: journal);
    await prepare(client, now: DateTime(2026, 10, 30, 21, 59));
    await prepare(client, now: DateTime(2026, 10, 30, 22, 1));
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
    expect(requests[1].body, requests[0].body);
    expect(storage.values.values.join(), isNot(contains(token)));
  });
  test('explicit new intent keeps the same route but changes operation key', () async {
    final client = service(store: journal);
    await prepare(client);
    await prepare(client.forNewIntent());
    expect(requests[1].headers['idempotency-key'], isNot(requests[0].headers['idempotency-key']));
  });
  test('restart replays saved JSON instead of recalculating request or price', () async {
    await prepare(service(store: journal));
    final restored = PreparationOperationJournal(storage: storage,
      passengerId: 'passenger-a', coreUri: core);
    final recovered = await service(store: restored).replayOperation((await restored.pending()).single);
    expect(requests[1].body, requests[0].body);
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
    expect(recovered.totalAmountCents, 12500);
  });
  test('storage failure prevents sending an untracked request', () async {
    storage.failWrites = true;
    await expectLater(prepare(service(store: journal)), throwsStateError);
    expect(requests, isEmpty);
  });
  test('another passenger cannot replay the operation through HTTP', () async {
    await prepare(service(store: journal));
    final foreign = PreparationOperationJournal(storage: storage,
      passengerId: 'passenger-b', coreUri: core);
    await expectLater(service(store: foreign).replayOperation((await journal.pending()).single), throwsStateError);
    expect(requests, hasLength(1));
  });
  test('legacy constructor keeps existing behavior without adding a header', () async {
    await prepare(service());
    expect(requests.single.headers.containsKey('idempotency-key'), false);
    expect(storage.values, isEmpty);
  });
  test('lost response retains the original operation for a network retry', () async {
    var calls = 0;
    final client = HttpRidePreparationService(baseUrl: core, accessToken: token,
      operationJournal: journal, client: MockClient((request) async {
        requests.add(request);
        if (++calls == 1) throw http.ClientException('Synthetic lost response');
        return success();
      }));
    await expectLater(prepare(client), throwsA(isA<http.ClientException>()));
    await prepare(client);
    expect(requests[1].body, requests[0].body);
    expect(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
    expect(await journal.pending(), hasLength(1));
  });
}
