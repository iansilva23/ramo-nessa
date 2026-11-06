import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/auth/http_password_auth_service.dart';

void main() {
  const nativeToken = 'abcdefghijklmnopqrstuvwxyz123456';
  Map<String, dynamic> session(String token) => {
    'accessToken': token,
    'expiresAt': '2027-01-01T00:00:00Z',
    'subjectId': 'driver-test',
    'subjectType': 'driver',
  };
  test(
    'password login sends identifier and password without requesting OTP',
    () async {
      final service = HttpPasswordAuthService(
        baseUrl: Uri.parse('https://example.test'),
        subjectType: 'driver',
        clientInstanceId: 'test-installation-instance',
        client: MockClient((request) async {
          expect(request.url.path, '/v1/auth/driver/password/login');
          expect(jsonDecode(request.body), {
            'identifier': 'driver.name',
            'password': 'Example12345',
          });
          expect(
            request.headers['x-client-instance-id'],
            'test-installation-instance',
          );
          return http.Response(jsonEncode(session(nativeToken)), 201);
        }),
      );
      expect(
        (await service.loginWithPassword(
          identifier: 'driver.name',
          password: 'Example12345',
        )).subjectType,
        'driver',
      );
    },
  );
  test('browser password login uses existing cookie role and public session handle', () async {
    const handle = 'ramo_web_driver_v1_0123456789abcdef0123456789abcdef';
    final service = HttpPasswordAuthService(
      baseUrl: Uri.parse('https://example.test'),
      subjectType: 'driver',
      browserSession: true,
      client: MockClient((request) async {
        expect(request.headers['x-ramo-web-role'], 'driver');
        return http.Response(jsonEncode(session(handle)), 201);
      }),
    );
    expect(
      (await service.loginWithPassword(
        identifier: 'driver@example.com',
        password: 'Example12345',
      )).accessToken,
      handle,
    );
  });
  test(
    'browser refuses raw bearer credential returned as a browser session',
    () async {
      final service = HttpPasswordAuthService(
        baseUrl: Uri.parse('https://example.test'),
        subjectType: 'driver',
        browserSession: true,
        client: MockClient(
          (_) async => http.Response(jsonEncode(session(nativeToken)), 201),
        ),
      );
      await expectLater(
        service.loginWithPassword(
          identifier: 'driver.name',
          password: 'Example12345',
        ),
        throwsFormatException,
      );
    },
  );
  test('enrollment requires the existing authenticated session and a persistence acknowledgement', () async {
    var calls = 0;
    final service = HttpPasswordAuthService(
      baseUrl: Uri.parse('https://example.test'),
      subjectType: 'driver',
      client: MockClient((request) async {
        calls++;
        expect(request.url.path, '/v1/driver/me/login-credentials');
        expect(request.headers['authorization'], 'Bearer $nativeToken');
        if (request.method == 'GET') {
          return http.Response('{"configured":false}', 200);
        }
        expect(jsonDecode(request.body), {
          'username': 'driver.name',
          'email': 'driver@example.com',
          'password': 'Example12345',
        });
        return http.Response(
          '{"configured":true,"username":"driver.name","email":"driver@example.com"}',
          201,
        );
      }),
    );
    expect((await service.loginCredentials(nativeToken)).configured, false);
    await service.createLoginCredentials(
      accessToken: nativeToken,
      username: 'driver.name',
      email: 'driver@example.com',
      password: 'Example12345',
    );
    expect(calls, 2);
  });
}
