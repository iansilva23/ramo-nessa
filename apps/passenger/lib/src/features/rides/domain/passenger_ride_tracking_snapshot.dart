class PassengerDriverProfile {
  const PassengerDriverProfile({
    required this.id,
    required this.displayName,
    required this.ratingCount,
    this.photoPath,
    this.ratingAverage,
  });

  factory PassengerDriverProfile.fromJson(Map<String, dynamic> json) {
    return PassengerDriverProfile(
      id: json['id'] as String,
      displayName:
          json['displayName'] as String? ?? 'Motorista Ramo Nessa',
      photoPath: json['photoPath'] as String?,
      ratingAverage: (json['ratingAverage'] as num?)?.toDouble(),
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String displayName;
  final String? photoPath;
  final double? ratingAverage;
  final int ratingCount;
}

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
    this.driver,
  });

  factory PassengerRideTrackingSnapshot.fromJson(
    Map<String, dynamic> json,
  ) {
    final ride = json['ride'] as Map<String, dynamic>;
    final driverLocationJson = json['driverLocation'];
    final driverJson = json['driver'];

    return PassengerRideTrackingSnapshot(
      rideId: ride['id'] as String,
      state: ride['state'] as String,
      category: ride['category'] as String,
      pickupLatitude: (ride['pickupLatitude'] as num?)?.toDouble(),
      pickupLongitude: (ride['pickupLongitude'] as num?)?.toDouble(),
      dropoffLatitude: (ride['dropoffLatitude'] as num?)?.toDouble(),
      dropoffLongitude: (ride['dropoffLongitude'] as num?)?.toDouble(),
      driverLocation: driverLocationJson is Map<String, dynamic>
          ? PassengerDriverLocation.fromJson(driverLocationJson)
          : null,
      driver: driverJson is Map<String, dynamic>
          ? PassengerDriverProfile.fromJson(driverJson)
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
  final PassengerDriverProfile? driver;

  bool get isTerminal => const {
        'COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_ADMIN',
        'REFUNDED',
      }.contains(state);
}
