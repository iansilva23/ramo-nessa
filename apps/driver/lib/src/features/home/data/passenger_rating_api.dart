class DriverPassengerRating {
  const DriverPassengerRating({
    required this.stars,
    required this.reasons,
    this.comment,
  });
  factory DriverPassengerRating.fromJson(Map<String, dynamic> json) =>
      DriverPassengerRating(
        stars: (json['stars'] as num).toInt(),
        reasons: (json['reasons'] as List).cast<String>(),
        comment: json['comment'] as String?,
      );
  final int stars;
  final List<String> reasons;
  final String? comment;
}

abstract interface class DriverPassengerRatingApi {
  Future<DriverPassengerRating?> passengerRating(String rideId);
  Future<DriverPassengerRating> ratePassenger({
    required String rideId,
    required int stars,
    required List<String> reasons,
    String? comment,
  });
}
