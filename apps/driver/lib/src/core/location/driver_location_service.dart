class DriverPosition {
  const DriverPosition({
    required this.latitude,
    required this.longitude,
  });

  final double latitude;
  final double longitude;
}

abstract interface class DriverLocationService {
  Future<DriverPosition> currentPosition();
}

class DriverLocationException implements Exception {
  const DriverLocationException(this.message);

  final String message;

  @override
  String toString() => message;
}
