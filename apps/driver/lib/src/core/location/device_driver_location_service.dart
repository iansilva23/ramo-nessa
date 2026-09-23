import 'package:geolocator/geolocator.dart';

import 'driver_location_service.dart';

class DeviceDriverLocationService implements DriverLocationService {
  @override
  Future<DriverPosition> currentPosition() async {
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
}
