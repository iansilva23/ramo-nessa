import 'package:latlong2/latlong.dart';

abstract interface class LocationService {
  Future<LatLng> getCurrentLocation();
}

class LocationServiceException implements Exception {
  const LocationServiceException(this.message);

  final String message;

  @override
  String toString() => message;
}
