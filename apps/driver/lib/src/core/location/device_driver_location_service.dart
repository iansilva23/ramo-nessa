import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import 'driver_location_service.dart';

class DeviceDriverLocationService with WidgetsBindingObserver implements DriverLocationService {
  void Function()? _refreshCameraSampling;
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

    return _deviceFix(position);
  }

  static DriverPosition _deviceFix(Position position) => DriverPosition(
    latitude: position.latitude, longitude: position.longitude,
    observedAt: position.timestamp, accuracyMeters: position.accuracy,
    speedMetersPerSecond: (kIsWeb ? position.speed > 0 : position.hasSpeed) && position.speed >= 0 ? position.speed : null,
    speedAccuracyMetersPerSecond: position.hasSpeedAccuracy && position.speedAccuracy > 0 ? position.speedAccuracy : null,
    courseDegrees: (kIsWeb || position.hasHeading) && position.heading >= 0 ? position.heading % 360 : null,
    courseAccuracyDegrees: position.hasHeadingAccuracy && position.headingAccuracy > 0 ? position.headingAccuracy : null);

  @visibleForTesting
  LocationSettings streamSettings({required bool foreground}) {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: foreground ? const Duration(seconds: 2) : null,
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
        timeLimit: foreground ? const Duration(seconds: 2) : null,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: foreground ? 3 : 20,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }

    return LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: foreground ? const Duration(seconds: 2) : null,
      distanceFilter: foreground ? 3 : 20,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _refreshCameraSampling?.call();
  }

  @override
  Stream<DriverPosition> positionStream() {
    late final StreamController<DriverPosition> output;
    StreamSubscription<Position>? background;
    Timer? cameraTimer;
    var closed = false, cameraBusy = false, generation = 0;
    Future<void> cameraFix() async {
      if (closed || !_foreground || cameraBusy) return;
      cameraBusy = true;
      final request = generation;
      try {
        final position = await Geolocator.getCurrentPosition(locationSettings: streamSettings(foreground: true));
        if (!closed && _foreground && request == generation) output.add(_deviceFix(position));
      } catch (_) {
        // A missed foreground sample does not stop the continuous GPS service.
      } finally { cameraBusy = false; }
    }
    void configureCamera() {
      generation++; cameraTimer?.cancel(); cameraTimer = null;
      if (closed || !_foreground) return;
      cameraTimer = Timer.periodic(const Duration(seconds: 1), (_) => unawaited(cameraFix()));
      unawaited(cameraFix());
    }
    output = StreamController<DriverPosition>(onListen: () async {
      try {
        await _ensureReady();
        if (closed) return;
        final lifecycle = WidgetsBinding.instance.lifecycleState;
        _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
        _refreshCameraSampling = configureCamera;
        WidgetsBinding.instance.addObserver(this);
        // This subscription keeps its original background settings throughout
        // foreground/background transitions and while another app is open.
        background = Geolocator.getPositionStream(locationSettings: streamSettings(foreground: false)).listen(
          (position) { if (!closed) output.add(_deviceFix(position)); },
          onError: (Object error, StackTrace stack) { if (!closed) output.addError(error, stack); },
          onDone: () { if (!closed) unawaited(output.close()); });
        configureCamera();
      } catch (error, stack) { if (!closed) output.addError(error, stack); }
    }, onCancel: () async {
      closed = true; generation++; cameraTimer?.cancel();
      _refreshCameraSampling = null;
      WidgetsBinding.instance.removeObserver(this);
      await background?.cancel();
    });
    return output.stream;
  }
}
