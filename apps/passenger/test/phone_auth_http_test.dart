import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/core/auth/http_phone_auth_service.dart';

void main() {
  test('fluxo OTP envia identificador estável da instalação', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"challengeId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",'
        '"expiresAt":"2026-09-23T18:00:00.000Z",'
        '"retryAfterSeconds":60}',
        202,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'),
      subjectType: 'passenger',
      clientInstanceId: 'device-test-instance-00000001',
      client: client,
    );

    final requested = await service.requestOtp(phone: '(88) 99999-1234');

    expect(requested.retryAfterSeconds, 60);
    expect(
      captured.headers['x-client-instance-id'],
      'device-test-instance-00000001',
    );
    expect(captured.headers['content-type'], 'application/json');
    expect(captured.body, isNot(contains('"email"')));
  });

  test('foto do passageiro usa endpoint autenticado e URL do Core', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"subjectId":"passenger-photo",'
        '"phoneE164":"+5588999991234",'
        '"email":"passageiro@example.com",'
        '"fullName":"Passageiro Teste",'
        '"photoUrl":"/v1/passenger/me/photo?v=2026-09-25T00%3A00%3A00.000Z"}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'),
      subjectType: 'passenger',
      client: client,
    );

    final account = await service.updatePassengerPhoto(
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      bytes: Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]),
      mimeType: 'image/jpeg',
    );

    expect(captured.method, 'PUT');
    expect(captured.url.path, '/v1/passenger/me/photo');
    expect(
      captured.headers['authorization'],
      'Bearer abcdefghijklmnopqrstuvwxyz123456',
    );
    final body = jsonDecode(captured.body) as Map<String, dynamic>;
    expect(body['mimeType'], 'image/jpeg');
    expect(body['dataBase64'], '/9j/2Q==');
    expect(
      account.photoUrl,
      'https://core.example.test/v1/passenger/me/photo'
      '?v=2026-09-25T00%3A00%3A00.000Z',
    );
  });

  test('Web session check uses passive endpoint and Bearer only in header', () async {
    const token = 'abcdefghijklmnopqrstuvwxyz123456';
    final client = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/v1/auth/me/check');
      expect(request.url.query, isEmpty);
      expect(request.url.toString(), isNot(contains(token)));
      expect(request.headers['authorization'], 'Bearer $token');
      return http.Response(
        '{"subjectId":"test-passenger","subjectType":"passenger",'
        '"expiresAt":"2027-01-01T00:00:00.000Z"}', 200,
      );
    });
    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'), subjectType: 'passenger',
      readOnlySessionCheck: true, client: client,
    );
    final session = await service.currentSession(token);
    expect(session?.subjectType, 'passenger');
    expect(session?.expiresAt.toUtc(), DateTime.utc(2027, 1, 1));
  });

  test('native default retains renewable session endpoint', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/v1/auth/me');
      return http.Response(
        '{"subjectId":"test-passenger","subjectType":"passenger",'
        '"expiresAt":"2027-01-01T00:00:00.000Z"}', 200,
      );
    });
    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'), subjectType: 'passenger',
      client: client,
    );
    expect(await service.currentSession('abcdefghijklmnopqrstuvwxyz123456'), isNotNull);
  });

  for (final status in [401, 403]) {
    test('passive session check treats HTTP $status as invalid session', () async {
      final service = HttpPhoneAuthService(
        baseUrl: Uri.parse('https://core.example.test'), subjectType: 'passenger',
        readOnlySessionCheck: true,
        client: MockClient((_) async => http.Response('{}', status)),
      );
      expect(await service.currentSession('abcdefghijklmnopqrstuvwxyz123456'), isNull);
    });
  }

  test('Web login requests cookie transport and accepts only a public session handle', () async {
    const handle = 'ramo_web_passenger_v1_0123456789abcdef0123456789abcdef';
    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'), subjectType: 'passenger',
      browserSession: true,
      client: MockClient((request) async {
        expect(request.headers['x-ramo-web-role'], 'passenger');
        return http.Response('{"accessToken":"$handle","subjectId":"fixture-role","subjectType":"passenger","expiresAt":"2027-01-01T00:00:00Z"}', 201);
      }),
    );
    final session = await service.verifyOtp(challengeId: 'fixture-challenge', code: '123456');
    expect(session.accessToken, handle);
  });

  test('new Web client rejects an old server that returns a private Bearer', () async {
    const privateToken = 'fixture-private-credential-abcdefghijklmnopqrstuvwxyz';
    final service = HttpPhoneAuthService(
      baseUrl: Uri.parse('https://core.example.test'), subjectType: 'passenger',
      browserSession: true,
      client: MockClient((_) async => http.Response('{"accessToken":"$privateToken","subjectId":"fixture-role","subjectType":"passenger","expiresAt":"2027-01-01T00:00:00Z"}', 201)),
    );
    await expectLater(service.verifyOtp(challengeId: 'fixture-challenge', code: '123456'),
      throwsA(isA<FormatException>().having((e) => e.toString().contains(privateToken), 'does not disclose credential', false)));
  });
}
