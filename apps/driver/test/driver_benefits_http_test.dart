import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/http_driver_api.dart';

import 'helpers/driver_benefits_fixtures.dart';

void main() {
  test('benefícios reutilizam Bearer e cliente sem identidade na URL', () async {
    late http.Request captured;
    final api = HttpDriverApi(baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: '  ranking-session  ', driverId: 'dev-driver', client: MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode(benefitSnapshotJson(history: true)), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
      }));
    final result = await api.benefits();
    expect(captured.method, 'GET');
    expect(captured.url.path, '/v1/driver/me/benefits');
    expect(captured.url.query, isEmpty);
    expect(captured.headers['authorization'], 'Bearer ranking-session');
    expect(captured.headers.containsKey('x-dev-driver-id'), isFalse);
    expect(result.campaigns.single.me.rank, 4);
  });

  test('sessão expirada mantém status e erro do Core', () async {
    final api = HttpDriverApi(baseUrl: Uri.parse('https://core.ramonessa.test'), client: MockClient((_) async =>
      http.Response('{"error":"AUTH_SESSION_EXPIRED","message":"Sessão expirada."}', 401,
        headers: {'content-type': 'application/json; charset=utf-8'})));
    await expectLater(api.benefits(), throwsA(isA<DriverApiException>()
      .having((error) => error.statusCode, 'status', 401).having((error) => error.code, 'code', 'AUTH_SESSION_EXPIRED')));
  });

  test('JSON inválido ou contrato inválido gera erro claro em vez de ranking', () async {
    for (final body in ['not-json', '{"enabled":true,"campaigns":{}}']) {
      final api = HttpDriverApi(baseUrl: Uri.parse('https://core.ramonessa.test'),
        client: MockClient((_) async => http.Response(body, 200)));
      await expectLater(api.benefits(), throwsA(isA<DriverApiException>()));
    }
  });
}
