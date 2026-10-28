class DriverPosition {
  const DriverPosition({
    required this.latitude,
    required this.longitude,
    this.observedAt,
    this.accuracyMeters,
    this.speedMetersPerSecond,
    this.speedAccuracyMetersPerSecond,
    this.courseDegrees,
    this.courseAccuracyDegrees,
  });

  final double latitude;
  final double longitude;
  final DateTime? observedAt;
  final double? accuracyMeters;
  final double? speedMetersPerSecond;
  final double? speedAccuracyMetersPerSecond;
  final double? courseDegrees;
  final double? courseAccuracyDegrees;
}

abstract interface class DriverLocationService {
  Future<DriverPosition> currentPosition();
  Stream<DriverPosition> positionStream();
}

class DriverLocationException implements Exception {
  const DriverLocationException(this.message);

  final String message;

  @override
  String toString() => message;
}
