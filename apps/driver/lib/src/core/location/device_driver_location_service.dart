import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import 'driver_location_service.dart';

class DeviceDriverLocationService with WidgetsBindingObserver implements DriverLocationService {
  void Function()? _restartSampling;
  bool _foreground = true;
  Future<void> _ensureReady() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      throw const DriverLocationException(
        'Ative a localização do aparelho para ficar online.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (
      permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever
    ) {
      throw const DriverLocationException(
        'Permissão de localização é necessária para receber corridas.',
      );
    }
  }

  @override
  Future<DriverPosition> currentPosition() async {
    await _ensureReady();

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 10),
      ),
    );

    return DriverPosition(
      latitude: position.latitude,
      longitude: position.longitude,
      observedAt: position.timestamp, accuracyMeters: position.accuracy,
      speedMetersPerSecond: (kIsWeb ? position.speed > 0 : position.hasSpeed) && position.speed >= 0 ? position.speed : null,
      speedAccuracyMetersPerSecond: position.hasSpeedAccuracy && position.speedAccuracy > 0 ? position.speedAccuracy : null,
      courseDegrees: (kIsWeb || position.hasHeading) && position.heading >= 0 ? position.heading % 360 : null,
      courseAccuracyDegrees: position.hasHeadingAccuracy && position.headingAccuracy > 0 ? position.headingAccuracy : null,
    );
  }

  @visibleForTesting
  LocationSettings streamSettings({required bool foreground}) {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: foreground ? 3 : 20,
        intervalDuration: Duration(seconds: foreground ? 1 : 10),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Ramo Nessa Motorista online',
          notificationText:
              'Sua localização está sendo atualizada para receber corridas.',
          notificationChannelName: 'Localização do motorista',
          notificationIcon: AndroidResource(
            name: 'ic_launcher',
            defType: 'drawable',
          ),
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: foreground ? 3 : 20,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }

    return LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: foreground ? 3 : 20,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _restartSampling?.call();
  }

  @override
  Stream<DriverPosition> positionStream() {
    late final StreamController<DriverPosition> output;
    StreamSubscription<Position>? subscription;
    var closed = false, generation = 0;
    Future<void> pending = Future.value();
    void restart() {
      final request = ++generation;
      pending = pending.then((_) async {
        if (closed || request != generation) return;
        await subscription?.cancel(); subscription = null;
        if (closed || request != generation) return;
        subscription = Geolocator.getPositionStream(locationSettings: streamSettings(foreground: _foreground)).listen(
          (position) {
            if (closed || request != generation) return;
            output.add(DriverPosition(latitude: position.latitude, longitude: position.longitude,
              observedAt: position.timestamp, accuracyMeters: position.accuracy,
              speedMetersPerSecond: (kIsWeb ? position.speed > 0 : position.hasSpeed) && position.speed >= 0 ? position.speed : null,
              speedAccuracyMetersPerSecond: position.hasSpeedAccuracy && position.speedAccuracy > 0 ? position.speedAccuracy : null,
              courseDegrees: (kIsWeb || position.hasHeading) && position.heading >= 0 ? position.heading % 360 : null,
              courseAccuracyDegrees: position.hasHeadingAccuracy && position.headingAccuracy > 0 ? position.headingAccuracy : null));
          },
          onError: (Object error, StackTrace stack) { if (!closed) output.addError(error, stack); },
          onDone: () { if (!closed && request == generation) unawaited(output.close()); },
        );
      }).catchError((Object error, StackTrace stack) { if (!closed) output.addError(error, stack); });
    }
    output = StreamController<DriverPosition>(onListen: () async {
      try {
        await _ensureReady();
        if (closed) return;
        final lifecycle = WidgetsBinding.instance.lifecycleState;
        _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
        _restartSampling = restart;
        WidgetsBinding.instance.addObserver(this);
        restart();
      } catch (error, stack) { if (!closed) output.addError(error, stack); }
    }, onCancel: () async {
      closed = true; generation++;
      _restartSampling = null;
      WidgetsBinding.instance.removeObserver(this);
      await pending;
      await subscription?.cancel();
    });
    return output.stream;
  }
}
