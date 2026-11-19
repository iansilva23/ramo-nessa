import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

typedef RealtimeChannelFactory = WebSocketChannel Function(
  Uri uri,
  Iterable<String> protocols,
);

/// A fresh, single-use ticket authenticates each connection. Bearer credentials
/// stay in same-origin HTTP headers and never enter a URL or socket protocol.
class BrowserRealtimeClient {
  BrowserRealtimeClient({
    required this.baseUrl,
    required this.pageUrl,
    required this.accessToken,
    this.allowInsecureLocalhost = false,
    this.requestTimeout = const Duration(seconds: 10),
    this.reconnectDelay = const Duration(seconds: 3),
    http.Client? client,
    RealtimeChannelFactory? channelFactory,
  }) : _client = client,
       _channelFactory =
           channelFactory ??
           ((uri, protocols) =>
               WebSocketChannel.connect(uri, protocols: protocols));

  final Uri baseUrl;
  final Uri pageUrl;
  final String accessToken;
  final bool allowInsecureLocalhost;
  final Duration requestTimeout;
  final Duration reconnectDelay;
  final http.Client? _client;
  final RealtimeChannelFactory _channelFactory;

  bool get _allowedOrigin {
    if (!baseUrl.hasAuthority ||
        !pageUrl.hasAuthority ||
        baseUrl.userInfo.isNotEmpty ||
        pageUrl.userInfo.isNotEmpty ||
        baseUrl.origin != pageUrl.origin) {
      return false;
    }
    return baseUrl.scheme == 'https' ||
        (allowInsecureLocalhost &&
            baseUrl.scheme == 'http' &&
            const {'localhost', '127.0.0.1', '::1'}.contains(baseUrl.host));
  }

  Stream<Map<String, dynamic>> watch(String role, {String? rideId}) {
    if (!_allowedOrigin ||
        accessToken.trim().length < 20 ||
        !const {'driver', 'passenger'}.contains(role) ||
        (role == 'passenger' && (rideId == null || rideId.trim().length < 3)) ||
        (role == 'driver' && rideId != null)) {
      return const Stream.empty();
    }

    final client = _client ?? http.Client();
    late StreamController<Map<String, dynamic>> controller;
    WebSocketChannel? channel;
    StreamSubscription<dynamic>? subscription;
    Timer? retry;
    bool stopped = false;
    bool connecting = false;
    int failures = 0;

    Future<void> disconnect() async {
      final oldSubscription = subscription;
      final oldChannel = channel;
      subscription = null;
      channel = null;
      await oldSubscription?.cancel();
      if (oldChannel != null) {
        // Cleanup must not hang logout when the network has disappeared.
        unawaited(oldChannel.sink.close().catchError((Object _) {}));
      }
    }

    Future<void> stop() async {
      stopped = true;
      retry?.cancel();
      await disconnect();
      if (_client == null) client.close();
      unawaited(controller.close());
    }

    late Future<void> Function() connect;
    void scheduleReconnect() {
      if (stopped || retry?.isActive == true) return;
      final multiplier = 1 << failures.clamp(0, 3).toInt();
      failures += 1;
      retry = Timer(reconnectDelay * multiplier, () {
        if (!stopped) unawaited(connect());
      });
    }

    connect = () async {
      if (stopped || connecting) return;
      connecting = true;
      try {
        await disconnect();
        final response = await client
            .post(
              baseUrl.replace(
                path: '/v1/realtime/ticket',
                query: '',
                fragment: '',
              ),
              headers: {
                'authorization': 'Bearer ${accessToken.trim()}',
                'content-type': 'application/json',
              },
              body: jsonEncode({
                'role': role,
                if (rideId != null) 'rideId': rideId.trim(),
              }),
            )
            .timeout(requestTimeout);
        if (stopped) return;
        if (response.statusCode == 401 || response.statusCode == 403) {
          await stop();
          return;
        }
        if (response.statusCode != 201) throw StateError('ticket_unavailable');
        final decoded = jsonDecode(response.body);
        final ticket = decoded is Map<String, dynamic>
            ? decoded['ticket']
            : null;
        if (ticket is! String ||
            !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(ticket)) {
          throw StateError('invalid_ticket');
        }
        final uri = baseUrl.replace(
          scheme: baseUrl.scheme == 'https' ? 'wss' : 'ws',
          path: '/v1/realtime/$role',
          queryParameters: {if (rideId != null) 'rideId': rideId.trim()},
          fragment: '',
        );
        final next = _channelFactory(uri, [
          'ramo.realtime.v1',
          'ticket.$ticket',
        ]);
        channel = next;
        subscription = next.stream.listen(
          (message) {
            if (stopped || message is! String) return;
            try {
              final event = jsonDecode(message);
              if (event is Map<String, dynamic>) {
                failures = 0;
                controller.add(event);
              }
            } catch (_) {
              // An invalid event cannot interrupt authenticated HTTP fallback.
            }
          },
          onError: (Object _) {
            scheduleReconnect();
          },
          onDone: () {
            if (next.closeCode == 4401) {
              unawaited(stop());
            } else {
              scheduleReconnect();
            }
          },
        );
        await next.ready.timeout(requestTimeout);
        if (stopped) await disconnect();
      } catch (_) {
        await disconnect();
        scheduleReconnect();
      } finally {
        connecting = false;
      }
    };

    controller = StreamController<Map<String, dynamic>>(
      onListen: () => unawaited(connect()),
      onCancel: () async {
        stopped = true;
        retry?.cancel();
        await disconnect();
        if (_client == null) client.close();
      },
    );
    return controller.stream;
  }
}
