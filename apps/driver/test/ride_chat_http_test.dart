import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/home/data/http_driver_api.dart';

void main() {
  test(
    'chat status, explicit read and history use authenticated endpoints',
    () async {
      final requests = <http.Request>[];
      final api = HttpDriverApi(
        baseUrl: Uri.parse('https://core.example.invalid'),
        accessToken: ' session-token ',
        client: MockClient((request) async {
          requests.add(request);
          expect(request.headers['authorization'], 'Bearer session-token');
          if (request.url.path.endsWith('/status'))
            return http.Response(
              jsonEncode({
                'unreadCount': 7,
                'passengerWhatsApp': '+5588999990001',
              }),
              200,
            );
          if (request.url.path.endsWith('/read'))
            return http.Response('{}', 200);
          return http.Response('{"messages":[]}', 200);
        }),
      );
      expect((await api.rideChatStatus('ride')).unreadCount, 7);
      await api.markRideMessagesRead('ride', ['seen-id']);
      await api.rideChatPage('ride', before: 'older-id');
      expect(requests[0].url.path, '/v1/driver/me/rides/ride/messages/status');
      expect(requests[1].url.path, '/v1/driver/me/rides/ride/messages/read');
      expect(requests[1].method, 'POST');
      expect(jsonDecode(requests[1].body), {
        'messageIds': ['seen-id'],
      });
      expect(requests[2].url.queryParameters['before'], 'older-id');
    },
  );
  test('failed status never masquerades as zero unread', () async {
    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((_) async => http.Response('{}', 503)),
    );
    await expectLater(api.rideChatStatus('ride'), throwsException);
    await expectLater(
      api.markRideMessagesRead('ride', ['id']),
      throwsException,
    );
  });
}
