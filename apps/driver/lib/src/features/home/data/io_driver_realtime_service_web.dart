import 'dart:async';
import 'driver_realtime_service.dart';

// Browser WebSocket can't send Authorization headers during the upgrade.
// HTTP offer polling remains active: do not expose auth tokens in URLs.
class IoDriverRealtimeService implements DriverRealtimeService {
  IoDriverRealtimeService({required Uri baseUrl, String? accessToken, String? driverId});
  @override
  Stream<DriverRealtimeUpdate> watch() => const Stream.empty();
}
