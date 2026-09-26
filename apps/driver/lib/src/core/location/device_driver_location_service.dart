import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import 'driver_location_service.dart';

class DeviceDriverLocationService implements DriverLocationService {
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
    );
  }

  LocationSettings _streamSettings() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 20,
        intervalDuration: const Duration(seconds: 10),
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
        distanceFilter: 20,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }

    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 20,
    );
  }

  @override
  Stream<DriverPosition> positionStream() async* {
    await _ensureReady();

    yield* Geolocator.getPositionStream(
      locationSettings: _streamSettings(),
    ).map(
      (position) => DriverPosition(
        latitude: position.latitude,
        longitude: position.longitude,
      ),
    );
  }
}
