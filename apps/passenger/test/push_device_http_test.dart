import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/core/notifications/http_push_device_service.dart';

void main() {
  test('registro FCM usa Bearer e envia token somente no corpo', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'device': {
            'id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'platform': 'android',
            'provider': 'fcm',
            'enabled': true,
            'updatedAt': '2026-09-24T05:00:00.000Z',
          },
          'deliveryProvider': 'fcm',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPushDeviceService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: client,
    );
    const accessToken =
        'rn_session_token_aaaaaaaaaaaaaaaaaaaaaaaa';
    const pushToken =
        'fcm-device-token-bbbbbbbbbbbbbbbbbbbbb';

    final device = await service.registerFcmToken(
      accessToken: accessToken,
      platform: 'android',
      token: pushToken,
      appVersion: '0.1.0',
      buildNumber: 1,
    );

    expect(captured.method, 'PUT');
    expect(
      captured.url.toString(),
      'https://core.example.test/v1/notifications/device',
    );
    expect(
      captured.headers['authorization'],
      'Bearer $accessToken',
    );
    expect(captured.url.toString().contains(accessToken), false);
    final body =
        jsonDecode(captured.body) as Map<String, dynamic>;
    expect(body['platform'], 'android');
    expect(body['provider'], 'fcm');
    expect(body['token'], pushToken);
    expect(body['appVersion'], '0.1.0');
    expect(body['buildNumber'], 1);
    expect(device.enabled, true);
    expect(device.provider, 'fcm');
  });

  test('registro rejeita plataforma inválida antes da rede', () async {
    var calls = 0;
    final client = MockClient((request) async {
      calls++;
      return http.Response('{}', 200);
    });

    final service = HttpPushDeviceService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: client,
    );

    await expectLater(
      service.registerFcmToken(
        accessToken:
            'rn_session_token_aaaaaaaaaaaaaaaaaaaaaaaa',
        platform: 'web',
        token: 'fcm-device-token-bbbbbbbbbbbbbbbbbbbbb',
      ),
      throwsA(isA<PushDeviceRegistrationException>()),
    );
    expect(calls, 0);
  });
}
