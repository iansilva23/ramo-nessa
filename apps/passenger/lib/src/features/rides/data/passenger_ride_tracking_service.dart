import '../domain/passenger_ride_tracking_snapshot.dart';

class PassengerDriverRatingResult {
  const PassengerDriverRatingResult({
    required this.stars,
    required this.ratingAverage,
    required this.ratingCount,
    required this.duplicate,
  });

  factory PassengerDriverRatingResult.fromJson(
    Map<String, dynamic> json,
  ) {
    return PassengerDriverRatingResult(
      stars: (json['stars'] as num).toInt(),
      ratingAverage: (json['ratingAverage'] as num).toDouble(),
      ratingCount: (json['ratingCount'] as num).toInt(),
      duplicate: json['duplicate'] as bool? ?? false,
    );
  }

  final int stars;
  final double ratingAverage;
  final int ratingCount;
  final bool duplicate;
}

abstract interface class PassengerRideTrackingService {
  Future<PassengerRideTrackingSnapshot> tracking(String rideId);

  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  );
}

class PassengerRideTrackingException implements Exception {
  const PassengerRideTrackingException(this.message);

  final String message;

  @override
  String toString() => message;
}
