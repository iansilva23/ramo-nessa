import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/app.dart';
import 'package:ramo_nessa_passenger/src/core/auth/phone_auth_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_ride_preparation_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_resume_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/preparation_operation_journal.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/preparation_recovery_coordinator.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/secure_preparation_operation_storage.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/preparation_recovery_gate.dart';
import 'preparation_operation_journal_test.dart' show MemoryOperations;

final core = Uri.parse('https://core.test');
final instant = DateTime.utc(2030, 1, 1);
Map<String, dynamic> rideData({String id = 'same-ride', String state = 'AWAITING_PAYMENT', bool expired = false}) => {
  'ride': {'id': id, 'state': state,
    'paymentExpiresAt': instant.add(Duration(minutes: expired ? -1 : 10)).toIso8601String(),
    'quote': {'baseAmountCents': 12000, 'pickupCompensationCents': 500, 'totalAmountCents': 12500}},
};
class Reads implements PassengerSelectedRideResumeService, PassengerRideResumeService {
  Map<String, dynamic> data = rideData();
  Map<String, dynamic> currentData = {'ride': null};
  bool failSelected = false;
  int selectedCalls = 0;
  int currentCalls = 0;
  @override
  Future<Map<String, dynamic>> resumeSelectedRide(String rideId) async {
    selectedCalls++;
    if (failSelected) throw StateError('Synthetic interrupted read');
    return data;
  }
  @override
  Future<Map<String, dynamic>> resumeRide({String? lastRideId}) async {
    currentCalls++;
    return currentData;
  }
}

void main() {
  late MemoryOperations storage;
  late PreparationOperationJournal journal;
  late Reads reads;
  late List<http.Request> requests;
  late Map<String, dynamic> response;
  var status = 201;
  var networkFailure = false;
  late HttpRidePreparationService service;
  PreparationRecoveryCoordinator coordinator() => PreparationRecoveryCoordinator(
    preparation: service, selected: reads, current: reads, clock: () => instant);

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    storage = MemoryOperations();
    journal = PreparationOperationJournal(storage: storage, passengerId: 'verified-a', coreUri: core);
    reads = Reads();
    requests = [];
    response = rideData();
    status = 201;
    networkFailure = false;
    service = HttpRidePreparationService(baseUrl: core, accessToken: 'synthetic-only-token',
      operationJournal: journal, client: MockClient((request) async {
        requests.add(request);
        if (networkFailure) throw http.ClientException('Synthetic network failure');
        return http.Response(jsonEncode(response), status);
      }));
  });

  test('activation remains disabled by default', () {
    expect(const RamoNessaPassengerApp().preparationReplayEnabled, false);
  });
  test('startup replays exact persisted body/key and validates server state before retiring it', () async {
    final operation = await journal.create({'pickup': {'latitude': -2.82}, 'quoteRequest': {'period': 'day'}});
    final result = await coordinator().recover();
    expect(result.ride?['ride']['id'], 'same-ride');
    expect(result.pendingRetry, false);
    expect(requests.single.headers['idempotency-key'], operation.key);
    expect(requests.single.body, operation.bodyJson);
    expect(await journal.pending(), isEmpty);
    expect(reads.selectedCalls, 1);
  });
  test('failed authenticated read keeps operation and does not generate a replacement key', () async {
    final operation = await journal.create({'synthetic': true});
    reads.failSelected = true;
    final result = await coordinator().recover();
    expect(result.pendingRetry, true);
    expect((await journal.pending()).single.key, operation.key);
    expect(requests.single.headers['idempotency-key'], operation.key);
  });
  test('network failure retains exact request and a later recovery succeeds', () async {
    final operation = await journal.create({'synthetic': true});
    networkFailure = true;
    expect((await coordinator().recover()).pendingRetry, true);
    networkFailure = false;
    expect((await coordinator().recover()).ride, isNotNull);
    expect(requests.every((r) => r.headers['idempotency-key'] == operation.key && r.body == operation.bodyJson), true);
  });
  test('expired operation is checked but never reopens checkout', () async {
    await journal.create({'synthetic': true});
    status = 409;
    response = {'error': 'PREPARATION_EXPIRED', 'rideId': 'same-ride'};
    reads.data = rideData(expired: true);
    final result = await coordinator().recover();
    expect(result.ride, isNull);
    expect(result.pendingRetry, false);
    expect(await journal.pending(), isEmpty);
  });
  test('cancelled operation does not return to payment or prepare a new ride', () async {
    await journal.create({'synthetic': true});
    status = 409;
    response = {'error': 'PREPARATION_ALREADY_ADVANCED', 'rideId': 'same-ride'};
    reads.data = rideData(state: 'CANCELLED_BY_PASSENGER');
    final result = await coordinator().recover();
    expect(result.ride, isNull);
    expect(requests, hasLength(1));
    expect(await journal.pending(), isEmpty);
  });
  test('already paid or in-progress operation restores current stage without another payment', () async {
    await journal.create({'synthetic': true});
    status = 409;
    response = {'error': 'PREPARATION_ALREADY_ADVANCED', 'rideId': 'same-ride'};
    reads.data = rideData(state: 'IN_PROGRESS');
    final result = await coordinator().recover();
    expect(result.ride?['ride']['state'], 'IN_PROGRESS');
    expect(requests.every((r) => r.url.path == '/v1/rides/prepare'), true);
    expect(await journal.pending(), isEmpty);
  });
  test('no eligible driver is definitive and does not block a new intent', () async {
    await journal.create({'synthetic': true});
    status = 422;
    response = {'error': 'NO_ELIGIBLE_DRIVER'};
    final result = await coordinator().recover();
    expect(result.pendingRetry, false);
    expect(reads.selectedCalls, 0);
    expect(await journal.pending(), isEmpty);
    expect(await journal.newIntent().operation(selection: 'new-search', body: {'new': true}), isA<PreparationOperation>());
  });
  test('wrong recovered ride identity is not accepted or acknowledged', () async {
    await journal.create({'synthetic': true});
    reads.data = rideData(id: 'another-ride');
    expect((await coordinator().recover()).pendingRetry, true);
    expect(await journal.pending(), hasLength(1));
  });
  test('ambiguous conflict keeps original operation instead of silently retrying with a new key', () async {
    final operation = await journal.create({'synthetic': true});
    status = 409;
    response = {'error': 'PREPARATION_KEY_CONFLICT'};
    expect((await coordinator().recover()).pendingRetry, true);
    expect((await journal.pending()).single.key, operation.key);
  });
  test('two simultaneous recovery calls share one run', () async {
    await journal.create({'synthetic': true});
    final recovery = coordinator();
    final results = await Future.wait([recovery.recover(), recovery.recover()]);
    expect(requests, hasLength(1));
    expect(results.first.ride, results.last.ride);
  });
  test('successful checkout handoff is recovered by GET without another preparation', () async {
    reads.currentData = rideData(state: 'IN_PROGRESS');
    final result = await coordinator().recover();
    expect(result.ride?['ride']['state'], 'IN_PROGRESS');
    expect(requests, isEmpty);
    expect(reads.currentCalls, 1);
  });
  test('payment-first checkout survives its shorter driver hold without extending payment expiry', () async {
    reads.currentData = rideData();
    (reads.currentData['ride'] as Map)['driverHoldExpiresAt'] = instant.subtract(const Duration(seconds: 1)).toIso8601String();
    final result = await coordinator().recover();
    expect(result.ride?['ride']['id'], 'same-ride');
    expect(result.ride?['ride']['paymentExpiresAt'], instant.add(const Duration(minutes: 10)).toIso8601String());
    expect(requests, isEmpty);
  });
  test('legacy driver-consent checkout retains its shorter driver hold validity', () async {
    reads.currentData = rideData();
    (reads.currentData['ride'] as Map).addAll({
      'driverConsentRequired': true,
      'driverHoldExpiresAt': instant.subtract(const Duration(seconds: 1)).toIso8601String(),
    });
    final result = await coordinator().recover();
    expect(result.ride, isNull);
    expect(result.pendingRetry, false);
    expect(requests, isEmpty);
  });
  test('server-selected current ride takes precedence over a stale uncertain checkout', () async {
    await journal.create({'synthetic': true});
    reads.currentData = rideData(id: 'current-paid-ride', state: 'IN_PROGRESS');
    expect((await coordinator().recover()).ride?['ride']['id'], 'current-paid-ride');
  });
  test('explicitly abandoned search is never submitted again on startup', () async {
    final operation = await journal.create({'synthetic': 'abandoned'});
    await journal.abandon(operation);
    reads.currentData = rideData(state: 'IN_PROGRESS');
    final result = await coordinator().recover();
    expect(requests, isEmpty);
    expect(result.ride?['ride']['state'], 'IN_PROGRESS');
    expect(result.pendingRetry, false);
    expect((await journal.pending()).single.abandoned, true);
  });
  test('verified account bootstrap rejects missing, expired or wrong-role sessions', () async {
    for (final session in <AuthSessionInfo?>[
      null,
      AuthSessionInfo(expiresAt: instant.subtract(const Duration(seconds: 1)), subjectId: 'verified-a', subjectType: 'passenger'),
      AuthSessionInfo(expiresAt: instant.add(const Duration(days: 1)), subjectId: 'verified-a', subjectType: 'driver'),
    ]) {
      await expectLater(verifiedPreparationJournal(verifyAccount: () async => session,
        coreUri: core, storage: storage, clock: () => instant), throwsStateError);
    }
    expect(storage.values, isEmpty);
  });
  test('verified account scope survives restart and cannot read another account', () async {
    await journal.create({'synthetic': true});
    Future<PreparationOperationJournal> load(String id) => verifiedPreparationJournal(
      verifyAccount: () async => AuthSessionInfo(expiresAt: instant.add(const Duration(days: 1)), subjectId: id, subjectType: 'passenger'),
      coreUri: core, storage: storage, clock: () => instant);
    expect(await (await load('verified-a')).pending(), hasLength(1));
    expect(await (await load('verified-b')).pending(), isEmpty);
  });
  test('secure adapter persists across instances and excludes unrelated credentials', () async {
    FlutterSecureStorage.setMockInitialValues({'auth-token': 'must-not-be-enumerated'});
    const adapter = SecurePreparationOperationStorage();
    final persisted = PreparationOperationJournal(storage: adapter, passengerId: 'verified-a', coreUri: core);
    final operation = await persisted.create({'synthetic': true});
    final restarted = PreparationOperationJournal(storage: const SecurePreparationOperationStorage(), passengerId: 'verified-a', coreUri: core);
    expect((await restarted.pending()).single.key, operation.key);
    expect((await adapter.readAll()).values.join(), isNot(contains('must-not-be-enumerated')));
  });

  testWidgets('bootstrap does not expose booking before account verification; retry recovers', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(home: PreparationSessionGate(
      loadJournal: () async { if (++calls == 1) throw StateError('offline'); return journal; },
      builder: (_) => const Text('verified-booking'),
    )));
    await tester.pumpAndSettle();
    expect(find.text('verified-booking'), findsNothing);
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('verified-booking'), findsOneWidget);
  });
  testWidgets('startup recovery displays existing ride before new booking screen', (tester) async {
    await journal.create({'synthetic': true});
    await tester.pumpWidget(MaterialApp(home: PreparationRecoveryGate(
      coordinator: coordinator(), child: const Text('map-ready'),
      buildRecovered: (data, close) => TextButton(onPressed: close,
        child: Text('recovered-${data['ride']['id']}')),
    )));
    await tester.pumpAndSettle();
    expect(find.text('recovered-same-ride'), findsOneWidget);
    expect(find.text('map-ready'), findsNothing);
    await tester.tap(find.text('recovered-same-ride'));
    await tester.pumpAndSettle();
    expect(find.text('map-ready'), findsOneWidget);
  });
  testWidgets('failed recovery leaves map available and offers a retry', (tester) async {
    await journal.create({'synthetic': true});
    networkFailure = true;
    await tester.pumpWidget(MaterialApp(home: PreparationRecoveryGate(
      coordinator: coordinator(), child: const Scaffold(body: Text('map-ready')),
      buildRecovered: (_, close) => TextButton(onPressed: close, child: const Text('recovered')),
    )));
    await tester.pumpAndSettle();
    expect(find.text('map-ready'), findsOneWidget);
    expect(find.text('Reconectar'), findsOneWidget);
    networkFailure = false;
    await tester.tap(find.text('Reconectar'));
    await tester.pumpAndSettle();
    expect(find.text('recovered'), findsOneWidget);
  });
  testWidgets('disposing during verification ignores stale completion', (tester) async {
    final pending = Completer<PreparationOperationJournal>();
    await tester.pumpWidget(MaterialApp(home: PreparationSessionGate(
      loadJournal: () => pending.future, builder: (_) => const Text('old-account'),
    )));
    await tester.pumpWidget(const MaterialApp(home: Text('new-account')));
    pending.complete(journal);
    await tester.pumpAndSettle();
    expect(find.text('new-account'), findsOneWidget);
    expect(find.text('old-account'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('session verification failure permits explicit login again without automatic logout', (tester) async {
    var logouts = 0;
    await tester.pumpWidget(MaterialApp(home: PreparationSessionGate(
      loadJournal: () async => throw StateError('Synthetic unverified session'),
      onLogout: () async { logouts++; return true; },
      builder: (_) => const Text('booking'),
    )));
    await tester.pumpAndSettle();
    expect(logouts, 0);
    expect(find.text('booking'), findsNothing);
    await tester.tap(find.text('Entrar novamente'));
    await tester.pumpAndSettle();
    expect(logouts, 1);
  });
}
