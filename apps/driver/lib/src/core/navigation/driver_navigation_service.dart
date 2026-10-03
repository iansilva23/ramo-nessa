class DriverNavigationException implements Exception {
  const DriverNavigationException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class DriverNavigationService {
  Future<void> openNavigation({
    required double latitude,
    required double longitude,
  });
}
