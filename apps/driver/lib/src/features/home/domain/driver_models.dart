class DriverSupplySnapshot {
  const DriverSupplySnapshot({
    required this.driverId,
    required this.vehicleId,
    required this.categories,
    required this.fourByFour,
    required this.seatCapacity,
    required this.online,
    required this.busy,
    required this.latitude,
    required this.longitude,
    required this.locationUpdatedAt,
  });

  factory DriverSupplySnapshot.fromJson(Map<String, dynamic> json) {
    return DriverSupplySnapshot(
      driverId: json['driverId'] as String,
      vehicleId: json['vehicleId'] as String,
      categories: (json['categories'] as List<dynamic>)
          .map((item) => item as String)
          .toList(growable: false),
      fourByFour: json['fourByFour'] as bool,
      seatCapacity: (json['seatCapacity'] as num).toInt(),
      online: json['online'] as bool,
      busy: json['busy'] as bool,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      locationUpdatedAt: DateTime.parse(json['locationUpdatedAt'] as String),
    );
  }

  final String driverId;
  final String vehicleId;
  final List<String> categories;
  final bool fourByFour;
  final int seatCapacity;
  final bool online;
  final bool busy;
  final double latitude;
  final double longitude;
  final DateTime locationUpdatedAt;
}

class DriverLocationRef {
  const DriverLocationRef({required this.zoneId, this.localityId});

  factory DriverLocationRef.fromJson(Map<String, dynamic> json) {
    return DriverLocationRef(
      zoneId: json['zoneId'] as String,
      localityId: json['localityId'] as String?,
    );
  }

  final String zoneId;
  final String? localityId;

  String get displayName {
    final raw = localityId ?? zoneId;
    const known = {
      'jericoacoara': 'Jericoacoara',
      'jijoca': 'Jijoca',
      'prea': 'Preá',
      'airport-jjd': 'Aeroporto JJD',
      'aeroporto-jjd': 'Aeroporto JJD',
    };
    final name = known[raw];
    if (name != null) return name;
    return raw
        .split(RegExp('[-_]'))
        .where((part) => part.isNotEmpty)
        .map((part) =>
            part.length == 1
                ? part.toUpperCase()
                : '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class DriverOffer {
  const DriverOffer({
    required this.id,
    required this.rideId,
    required this.expiresAt,
    required this.approximatePickupDistanceKm,
    required this.category,
    required this.passengers,
    required this.origin,
    required this.destination,
    required this.driverEarningsCents,
    required this.pickupCompensationCents,
  });

  factory DriverOffer.fromJson(Map<String, dynamic> json) {
    return DriverOffer(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      approximatePickupDistanceKm:
          (json['approximatePickupDistanceKm'] as num).toDouble(),
      category: json['category'] as String,
      passengers: (json['passengers'] as num).toInt(),
      origin: DriverLocationRef.fromJson(
        json['origin'] as Map<String, dynamic>,
      ),
      destination: DriverLocationRef.fromJson(
        json['destination'] as Map<String, dynamic>,
      ),
      driverEarningsCents: (json['driverEarningsCents'] as num).toInt(),
      pickupCompensationCents:
          (json['pickupCompensationCents'] as num).toInt(),
    );
  }

  final String id;
  final String rideId;
  final DateTime expiresAt;
  final double approximatePickupDistanceKm;
  final String category;
  final int passengers;
  final DriverLocationRef origin;
  final DriverLocationRef destination;
  final int driverEarningsCents;
  final int pickupCompensationCents;

  String get categoryLabel => switch (category) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => category,
      };
}

class AcceptedDriverRide {
  const AcceptedDriverRide({
    required this.id,
    required this.state,
    required this.category,
    required this.passengers,
    required this.origin,
    required this.destination,
    required this.driverEarningsCents,
    required this.pickupCompensationCents,
    this.pickupLatitude,
    this.pickupLongitude,
  });

  factory AcceptedDriverRide.fromJson(Map<String, dynamic> json) {
    return AcceptedDriverRide(
      id: json['id'] as String,
      state: json['state'] as String,
      category: json['category'] as String,
      passengers: (json['passengers'] as num).toInt(),
      origin: DriverLocationRef.fromJson(
        json['origin'] as Map<String, dynamic>,
      ),
      destination: DriverLocationRef.fromJson(
        json['destination'] as Map<String, dynamic>,
      ),
      driverEarningsCents: (json['driverEarningsCents'] as num).toInt(),
      pickupCompensationCents:
          (json['pickupCompensationCents'] as num).toInt(),
      pickupLatitude: (json['pickupLatitude'] as num?)?.toDouble(),
      pickupLongitude: (json['pickupLongitude'] as num?)?.toDouble(),
    );
  }

  final String id;
  final String state;
  final String category;
  final int passengers;
  final DriverLocationRef origin;
  final DriverLocationRef destination;
  final int driverEarningsCents;
  final int pickupCompensationCents;
  final double? pickupLatitude;
  final double? pickupLongitude;
}

String formatCents(int cents) {
  final reais = cents ~/ 100;
  final centavos = (cents % 100).toString().padLeft(2, '0');
  return 'R\$ $reais,$centavos';
}


class DriverRideCompletion {
  const DriverRideCompletion({
    required this.ride,
    required this.driverBalanceCents,
    required this.duplicateSettlement,
  });

  factory DriverRideCompletion.fromJson(Map<String, dynamic> json) {
    return DriverRideCompletion(
      ride: AcceptedDriverRide.fromJson(
        json['ride'] as Map<String, dynamic>,
      ),
      driverBalanceCents: (json['driverBalanceCents'] as num).toInt(),
      duplicateSettlement: json['duplicateSettlement'] as bool? ?? false,
    );
  }

  final AcceptedDriverRide ride;
  final int driverBalanceCents;
  final bool duplicateSettlement;
}
