import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/auth/http_password_auth_service.dart';

void main() {
  test(
    'registration sends credentials to the role-specific password endpoint',
    () async {
      var calls = 0;
      final service = HttpPasswordAuthService(
        baseUrl: Uri.parse('https://example.test'),
        subjectType: 'driver',
        client: MockClient((r) async {
          calls++;
          expect(r.url.path, '/v1/auth/driver/password/register');
          expect(jsonDecode(r.body), {
            'fullName': 'Conta Teste',
            'phone': '88999994321',
            'email': 'test@example.test',
            'password': 'Example12345',
            'username': 'driver.name',
          });
          return http.Response(
            jsonEncode({
              'accessToken': 'abcdefghijklmnopqrstuvwxyz123456',
              'expiresAt': '2027-01-01T00:00:00Z',
              'subjectId': 'driver-test',
              'subjectType': 'driver',
            }),
            201,
          );
        }),
      );
      final session = await service.registerWithPassword(
        fullName: 'Conta Teste',
        phone: '88999994321',
        email: 'test@example.test',
        password: 'Example12345',
        username: 'driver.name',
      );
      expect(session.subjectType, 'driver');
      expect(calls, 1);
    },
  );
  test('registration conflict is surfaced without issuing a session', () async {
    final service = HttpPasswordAuthService(
      baseUrl: Uri.parse('https://example.test'),
      subjectType: 'driver',
      client: MockClient(
        (r) async => http.Response(
          '{"error":"ACCOUNT_ALREADY_EXISTS","message":"Conta existente."}',
          409,
        ),
      ),
    );
    await expectLater(
      service.registerWithPassword(
        fullName: 'Conta Teste',
        phone: '88999994321',
        email: 'test@example.test',
        password: 'Example12345',
        username: 'driver.name',
      ),
      throwsA(isA<AuthHttpException>()),
    );
  });
}
