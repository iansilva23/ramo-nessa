import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/preparation_operation_journal.dart';

class MemoryOperations implements PreparationOperationStorage {
  final values = <String, String>{};
  bool failWrites = false;
  @override
  Future<Map<String, String>> readAll() async => Map.of(values);
  @override
  Future<void> write(String key, String value) async {
    if (failWrites) throw StateError('Storage unavailable');
    values[key] = value;
  }
  @override
  Future<void> delete(String key) async { values.remove(key); }
}

void main() {
  late MemoryOperations storage;
  late PreparationOperationJournal journal;
  var serial = 0;
  final body = <String, dynamic>{
    'quoteRequest': {'category': 'car', 'period': 'day', 'passengers': 1},
    'pickup': {'latitude': -2.82, 'longitude': -40.41},
    'dropoff': {'latitude': -2.89, 'longitude': -40.45},
  };
  PreparationOperationJournal forOwner(String owner, {String host = 'core.test'}) =>
      PreparationOperationJournal(storage: storage, passengerId: owner,
        coreUri: Uri.parse('https://$host'),
        newKey: () => 'synthetic-operation-${++serial}');

  setUp(() {
    storage = MemoryOperations();
    journal = forOwner('passenger-a');
  });

  test('80 concurrent retries of one selection share a persisted operation', () async {
    final intent = journal.newIntent();
    final operations = await Future.wait(List.generate(80, (_) =>
      intent.operation(selection: 'car-nearby-one', body: body)));
    expect(operations.map((o) => o.key).toSet(), hasLength(1));
    expect(storage.values, hasLength(1));
  });
  test('an explicit new intent for the same route gets another key', () async {
    final a = await journal.newIntent().operation(selection: 'same', body: body);
    final b = await journal.newIntent().operation(selection: 'same', body: body);
    expect(a.key, isNot(b.key));
    expect(await journal.pending(), hasLength(2));
  });
  test('different radius or category stays independent within an intent', () async {
    final intent = journal.newIntent();
    final operations = await Future.wait([
      intent.operation(selection: 'car-3km', body: body),
      intent.operation(selection: 'car-15km', body: {...body, 'searchRadiusKm': 15}),
      intent.operation(selection: 'moto-3km', body: {...body, 'category': 'moto'}),
    ]);
    expect(operations.map((o) => o.key).toSet(), hasLength(3));
  });
  test('a retry freezes exact JSON across a clock/period change', () async {
    final intent = journal.newIntent();
    final a = await intent.operation(selection: 'same', body: body);
    final b = await intent.operation(selection: 'same', body: {
      ...body, 'quoteRequest': {'category': 'car', 'period': 'after_22'},
    });
    expect(b.key, a.key);
    expect(b.bodyJson, a.bodyJson);
    expect(b.body['quoteRequest']['period'], 'day');
  });
  test('caller mutation cannot alter a saved or returned request', () async {
    final mutable = jsonDecode(jsonEncode(body)) as Map<String, dynamic>;
    final future = journal.newIntent().operation(selection: 'same', body: mutable);
    (mutable['pickup'] as Map)['latitude'] = 99;
    final a = await future;
    (a.body['pickup'] as Map)['latitude'] = 88;
    expect(a.body['pickup']['latitude'], -2.82);
  });
  test('restart recovers exactly the original operation and JSON', () async {
    final a = await journal.create(body);
    final recovered = (await forOwner('passenger-a').pending()).single;
    expect(recovered.key, a.key);
    expect(recovered.bodyJson, a.bodyJson);
    expect(recovered.createdAt, a.createdAt);
  });
  test('different passengers and servers cannot read each other operations', () async {
    await journal.create(body);
    expect(await forOwner('passenger-b').pending(), isEmpty);
    expect(await forOwner('passenger-a', host: 'other.test').pending(), isEmpty);
  });
  test('acknowledging one operation leaves all other intents intact', () async {
    final a = await journal.create(body);
    final b = await journal.create(body);
    await journal.acknowledge(a);
    expect((await journal.pending()).single.key, b.key);
  });
  test('another passenger cannot acknowledge this operation', () async {
    final operation = await journal.create(body);
    expect(() => forOwner('passenger-b').acknowledge(operation), throwsStateError);
    expect(await journal.pending(), hasLength(1));
  });
  test('write failure is visible and the same intent can retry storage', () async {
    final intent = journal.newIntent();
    storage.failWrites = true;
    await expectLater(intent.operation(selection: 'same', body: body), throwsStateError);
    storage.failWrites = false;
    await intent.operation(selection: 'same', body: body);
    expect(await journal.pending(), hasLength(1));
  });
  test('corrupt stored operation is not silently dropped', () async {
    await journal.create(body);
    storage.values[storage.values.keys.single] = '{}';
    await expectLater(journal.pending(), throwsFormatException);
    expect(storage.values, hasLength(1));
  });
  test('production keys match server validation and are independently random', () async {
    final production = PreparationOperationJournal(storage: storage,
      passengerId: 'passenger-a', coreUri: Uri.parse('https://core.test'));
    final operations = await Future.wait(List.generate(100, (_) => production.create(body)));
    expect(operations.map((o) => o.key).toSet(), hasLength(100));
    expect(operations.every((o) => RegExp(r'^[A-Za-z0-9_-]{16,128}$').hasMatch(o.key)), isTrue);
  });
}
