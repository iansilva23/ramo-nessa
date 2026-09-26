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

class PassengerRideChatMessage {
  const PassengerRideChatMessage({
    required this.id,
    required this.rideId,
    required this.senderType,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  factory PassengerRideChatMessage.fromJson(Map<String, dynamic> json) {
    return PassengerRideChatMessage(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      senderType: json['senderType'] as String,
      senderId: json['senderId'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  final String id;
  final String rideId;
  final String senderType;
  final String senderId;
  final String body;
  final DateTime createdAt;

  bool get fromPassenger => senderType == 'passenger';
}

abstract interface class PassengerRideTrackingService {
  Future<PassengerRideTrackingSnapshot> tracking(String rideId);

  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  );

  Future<List<PassengerRideChatMessage>> rideMessages(String rideId);

  Future<PassengerRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  });
}

class PassengerRideTrackingException implements Exception {
  const PassengerRideTrackingException(this.message);

  final String message;

  @override
  String toString() => message;
}
