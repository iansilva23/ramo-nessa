import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_realtime/browser_realtime_client.dart';

const token = 'a-long-bearer-token-for-test-only';
const ticket = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

void main() {
  test(
    'no request for another origin, insecure release URL or invalid scope',
    () async {
      var calls = 0;
      final httpClient = MockClient((request) async {
        calls++;
        return http.Response('{}', 201);
      });
      for (final base in [
        'https://evil.example.com/',
        'http://app.example.com/',
      ]) {
        final client = BrowserRealtimeClient(
          baseUrl: Uri.parse(base),
          pageUrl: Uri.parse('https://app.example.com/passenger/'),
          accessToken: token,
          client: httpClient,
        );
        expect(await client.watch('driver').toList(), isEmpty);
      }
      final client = BrowserRealtimeClient(
        baseUrl: Uri.parse('https://app.example.com/'),
        pageUrl: Uri.parse('https://app.example.com/passenger/'),
        accessToken: token,
        client: httpClient,
      );
      expect(await client.watch('passenger').toList(), isEmpty);
      expect(
        await client.watch('driver', rideId: 'ride-other').toList(),
        isEmpty,
      );
      expect(calls, 0);
    },
  );

  test(
    '401 ends realtime without reconnecting; HTTP consumers remain independent',
    () async {
      var calls = 0;
      final client = BrowserRealtimeClient(
        baseUrl: Uri.parse('https://app.example.com/'),
        pageUrl: Uri.parse('https://app.example.com/'),
        accessToken: token,
        reconnectDelay: const Duration(milliseconds: 1),
        client: MockClient((request) async {
          calls++;
          expect(request.url.path, '/v1/realtime/ticket');
          expect(request.url.query, isEmpty);
          expect(request.headers['authorization'], 'Bearer $token');
          return http.Response('{}', 401);
        }),
      );
      expect(await client.watch('driver').toList(), isEmpty);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(calls, 1);
    },
  );

  test(
    'cancel during ticket request never opens socket or reconnects',
    () async {
      final response = Completer<http.Response>();
      final requested = Completer<void>();
      var sockets = 0;
      final client = BrowserRealtimeClient(
        baseUrl: Uri.parse('https://app.example.com/'),
        pageUrl: Uri.parse('https://app.example.com/'),
        accessToken: token,
        client: MockClient((request) {
          requested.complete();
          return response.future;
        }),
        channelFactory: (uri, protocols) {
          sockets++;
          throw StateError('unexpected socket');
        },
      );
      final sub = client.watch('driver').listen((_) {});
      await requested.future;
      await sub.cancel();
      response.complete(http.Response(jsonEncode({'ticket': ticket}), 201));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(sockets, 0);
    },
  );

  test('real socket keeps credentials off URL, filters malformed JSON and obtains a fresh ticket after reconnect', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final base = Uri.parse('http://127.0.0.1:${server.port}/');
    var requests = 0;
    var sockets = 0;
    final offeredTickets = <String>[];
    final active = <WebSocket>[];
    final serverSubscription = server.listen((request) async {
      if (!WebSocketTransformer.isUpgradeRequest(request)) {
        expect(request.uri.path, '/v1/realtime/ticket');
        expect(request.headers.value('authorization'), 'Bearer $token');
        final body = jsonDecode(await utf8.decoder.bind(request).join()) as Map;
        expect(body['role'], 'passenger');
        expect(body['rideId'], 'ride-one');
        requests++;
        final nextTicket = '${requests.toString().padLeft(43, 'A')}';
        request.response.headers.contentType = ContentType.json;
        request.response.statusCode = 201;
        request.response.write(jsonEncode({'ticket': nextTicket}));
        await request.response.close();
        return;
      }
      sockets++;
      expect(request.uri.path, '/v1/realtime/passenger');
      expect(request.uri.queryParameters, {'rideId': 'ride-one'});
      expect(request.headers.value('authorization'), isNull);
      final protocols = request.headers.value('sec-websocket-protocol')!;
      expect(protocols, isNot(contains(token)));
      offeredTickets.add(protocols);
      final socket = await WebSocketTransformer.upgrade(
        request,
        protocolSelector: (protocols) => 'ramo.realtime.v1',
      );
      active.add(socket);
      socket.add('malformed');
      socket.add(
        jsonEncode({'type': 'passenger.ride.tracking', 'sequence': sockets}),
      );
      if (sockets == 1) await socket.close();
    });
    final client = BrowserRealtimeClient(
      baseUrl: base,
      pageUrl: base,
      accessToken: token,
      allowInsecureLocalhost: true,
      reconnectDelay: const Duration(milliseconds: 5),
    );
    final updates = <Map<String, dynamic>>[];
    final done = Completer<void>();
    final subscription = client.watch('passenger', rideId: 'ride-one').listen((
      event,
    ) {
      updates.add(event);
      if (updates.length == 2) done.complete();
    });
    try {
      await done.future.timeout(const Duration(seconds: 5));
      await subscription.cancel();
      expect(updates.map((event) => event['sequence']), [1, 2]);
      expect(requests, 2);
      expect(offeredTickets[0], isNot(offeredTickets[1]));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(requests, 2);
    } finally {
      await subscription.cancel();
      for (final socket in active) {
        await socket.close();
      }
      await serverSubscription.cancel();
      await server.close(force: true);
    }
  });
}
