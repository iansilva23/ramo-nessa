import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Reports Android screen state; it does not change driver availability.
class DriverScreenLockEvents {
  DriverScreenLockEvents({EventChannel? channel, Stream<Object?>? testEvents})
      : _channel = channel ??
            const EventChannel('br.com.ramonessa.driver/screen-lock'),
        _testEvents = testEvents;

  final EventChannel _channel;
  final Stream<Object?>? _testEvents;

  Stream<bool> get states {
    final Stream<Object?> source;
    if (_testEvents != null) {
      source = _testEvents;
    } else if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const Stream<bool>.empty();
    } else {
      source = _channel.receiveBroadcastStream();
    }
    return source
        .where((event) => event == 'locked' || event == 'unlocked')
        .map((event) => event == 'locked')
        .distinct();
  }
}
