import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/preparation_request_identity.dart';

void main() {
  final body = <String, dynamic>{'pickup': {'latitude': -2.82}, 'category': 'car'};
  test('80 submissions of the same attempt use one key and exact body', () {
    final intent = PreparationSearchIntent();
    final requests = List.generate(80, (_) => intent.operation(selection: 'same', body: body));
    expect(requests.map((r) => r.key).toSet(), hasLength(1));
    expect(requests.every((r) => r.bodyJson == jsonEncode(body)), true);
  });
  test('40 explicit new searches remain distinct even on the same route', () {
    final requests = List.generate(40, (_) => PreparationSearchIntent().operation(selection: 'same', body: body));
    expect(requests.map((r) => r.key).toSet(), hasLength(40));
  });
  test('switching A to B to A does not revive the first A request', () {
    final intent = PreparationSearchIntent();
    final first = intent.operation(selection: 'A', body: body);
    final second = intent.operation(selection: 'B', body: {...body, 'category': 'moto'});
    final third = intent.operation(selection: 'A', body: body);
    expect({first.key, second.key, third.key}, hasLength(3));
  });
  test('caller mutation cannot change the original submitted JSON', () {
    final mutable = jsonDecode(jsonEncode(body)) as Map<String, dynamic>;
    final intent = PreparationSearchIntent();
    final first = intent.operation(selection: 'same', body: mutable);
    (mutable['pickup'] as Map)['latitude'] = 99;
    expect(intent.operation(selection: 'same', body: mutable).bodyJson, first.bodyJson);
    expect(jsonDecode(first.bodyJson)['pickup']['latitude'], -2.82);
  });
  test('reset permits a new attempt after a definitive server result', () {
    final intent = PreparationSearchIntent();
    final first = intent.operation(selection: 'same', body: body);
    intent.reset();
    expect(intent.operation(selection: 'same', body: body).key, isNot(first.key));
  });
  test('keys match server validation and empty selection is rejected', () {
    final intent = PreparationSearchIntent();
    expect(intent.operation(selection: 'same', body: body).key, matches(RegExp(r'^[A-Za-z0-9_-]{16,128}$')));
    expect(() => intent.operation(selection: '', body: body), throwsArgumentError);
  });
}
