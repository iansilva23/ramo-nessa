import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_growth_service.dart';

void main() {
  test('benefícios usam Bearer e permitem retirar consentimento por canal', () async {
    final requests = <http.Request>[];
    final service = PassengerGrowthService(
      baseUrl: Uri.parse('https://core.example.test'),
      accessToken: 'test-access-token',
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode({'preference': {}, 'benefits': [], 'messages': []}), 200);
      }),
    );
    addTearDown(service.close);
    await service.load();
    await service.savePreferences({
      'channels': {'inapp': true, 'push': false, 'email': false, 'whatsapp': false},
      'birthdayMonthDay': null, 'audience': 'unspecified', 'zone': null,
    });
    expect(requests.first.url.path, '/v1/passenger/me/marketing');
    expect(requests.last.method, 'PUT');
    expect(requests.every((r) => r.headers['authorization'] == 'Bearer test-access-token'), isTrue);
    expect(requests.every((r) => !r.url.toString().contains('test-access-token')), isTrue);
    final saved = jsonDecode(requests.last.body) as Map<String, dynamic>;
    expect(saved['birthdayMonthDay'], isNull);
    expect((saved['channels'] as Map)['whatsapp'], isFalse);
  });
  test('falha HTTP não é apresentada como preferência salva', () async {
    final service = PassengerGrowthService(
      baseUrl: Uri.parse('https://core.example.test'), accessToken: 'test',
      client: MockClient((_) async => http.Response('{"message":"Sessão expirada"}', 401)),
    );
    addTearDown(service.close);
    await expectLater(service.load(), throwsA(isA<PassengerGrowthException>().having((e) => e.message, 'message', 'Sessão expirada')));
  });
}
