import '../domain/prepared_ride.dart';

abstract interface class DriverConfirmationService {
  Future<void> requestDriverConfirmation(String rideId);
  Future<DriverConfirmation> driverConfirmation(String rideId);
  Future<void> releaseDriverReservation(String rideId);
}

class DriverConfirmation {
  const DriverConfirmation({required this.ride, required this.status, this.driver});
  factory DriverConfirmation.fromJson(Map<String, dynamic> json) => DriverConfirmation(
    ride: PreparedRide.fromJson(json), status: json['status'] as String,
    driver: json['driver'] is Map<String, dynamic>
        ? ConfirmedDriver.fromJson(json['driver'] as Map<String, dynamic>) : null,
  );
  final PreparedRide ride;
  final String status;
  final ConfirmedDriver? driver;
}

class ConfirmedDriver {
  const ConfirmedDriver({required this.name, required this.vehicle, required this.plate,
    this.photoUrl, this.ratingAverage, this.ratingCount = 0, this.arrivalSeconds});
  factory ConfirmedDriver.fromJson(Map<String, dynamic> json) => ConfirmedDriver(
    name: json['displayName'] as String, vehicle: json['vehicle'] as String,
    plate: json['plate'] as String, photoUrl: json['photoUrl'] as String?,
    ratingAverage: (json['ratingAverage'] as num?)?.toDouble(),
    ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
    arrivalSeconds: (json['arrivalSeconds'] as num?)?.toInt(),
  );
  final String name;
  final String vehicle;
  final String plate;
  final String? photoUrl;
  final double? ratingAverage;
  final int ratingCount;
  final int? arrivalSeconds;
}
