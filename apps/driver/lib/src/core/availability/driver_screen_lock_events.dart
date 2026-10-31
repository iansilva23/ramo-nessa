import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Reports Android screen state; it does not change driver availability.
class DriverScreenLockEvents {
  DriverScreenLockEvents({EventChannel? channel})
      : _channel = channel ??
            const EventChannel('br.com.ramonessa.driver/screen-lock');

  final EventChannel _channel;

  Stream<bool> get states {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const Stream<bool>.empty();
    }
    return _channel
        .receiveBroadcastStream()
        .where((event) => event == 'locked' || event == 'unlocked')
        .map((event) => event == 'locked')
        .distinct();
  }
}
