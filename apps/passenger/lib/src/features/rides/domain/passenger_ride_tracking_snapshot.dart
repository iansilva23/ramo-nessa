class PassengerDriverLocation {
  const PassengerDriverLocation({
    required this.latitude,
    required this.longitude,
    required this.updatedAt,
    required this.stale,
  });

  factory PassengerDriverLocation.fromJson(Map<String, dynamic> json) {
    return PassengerDriverLocation(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      stale: json['stale'] as bool? ?? false,
    );
  }

  final double latitude;
  final double longitude;
  final DateTime updatedAt;
  final bool stale;
}

class PassengerRideTrackingSnapshot {
  const PassengerRideTrackingSnapshot({
    required this.rideId,
    required this.state,
    required this.category,
    this.pickupLatitude,
    this.pickupLongitude,
    this.dropoffLatitude,
    this.dropoffLongitude,
    this.driverLocation,
  });

  factory PassengerRideTrackingSnapshot.fromJson(
    Map<String, dynamic> json,
  ) {
    final ride = json['ride'] as Map<String, dynamic>;
    final driver = json['driverLocation'];

    return PassengerRideTrackingSnapshot(
      rideId: ride['id'] as String,
      state: ride['state'] as String,
      category: ride['category'] as String,
      pickupLatitude: (ride['pickupLatitude'] as num?)?.toDouble(),
      pickupLongitude: (ride['pickupLongitude'] as num?)?.toDouble(),
      dropoffLatitude: (ride['dropoffLatitude'] as num?)?.toDouble(),
      dropoffLongitude: (ride['dropoffLongitude'] as num?)?.toDouble(),
      driverLocation: driver is Map<String, dynamic>
          ? PassengerDriverLocation.fromJson(driver)
          : null,
    );
  }

  final String rideId;
  final String state;
  final String category;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final double? dropoffLatitude;
  final double? dropoffLongitude;
  final PassengerDriverLocation? driverLocation;

  bool get isTerminal => const {
        'COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_ADMIN',
        'REFUNDED',
      }.contains(state);
}
