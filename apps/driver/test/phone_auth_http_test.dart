import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/auth/http_phone_auth_service.dart';

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
      subjectType: 'driver',
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
}
