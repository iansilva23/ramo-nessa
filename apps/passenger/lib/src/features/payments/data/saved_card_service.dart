import 'card_tokenization_service.dart';
import '../domain/card_ride_payment_result.dart';
class SavedPassengerCard {
  const SavedPassengerCard({required this.id, required this.lastFourDigits, required this.paymentMethodId, required this.paymentMethodType});
  factory SavedPassengerCard.fromJson(Map<String,dynamic> json) => SavedPassengerCard(
    id: json['id'] as String, lastFourDigits: json['lastFourDigits'] as String,
    paymentMethodId: json['paymentMethodId'] as String, paymentMethodType: json['paymentMethodType'] as String);
  final String id, lastFourDigits, paymentMethodId, paymentMethodType;
}
abstract interface class SavedCardService {
  Future<List<SavedPassengerCard>> savedCards();
  Future<SavedPassengerCard> saveCard({required String token, required String payerEmail});
  Future<void> removeCard(String id);
  Future<CardRidePaymentResult> payWithCard({required String rideId, required String idempotencyKey,
    required CardTokenizationResult card, required String payerEmail, String? savedCardId});
}
abstract interface class SavedCardTokenizationService {
  Future<CardTokenizationResult> tokenizeSavedCard(SavedPassengerCard card);
}

abstract interface class StorageCardTokenizationService {
  Future<CardTokenizationResult> tokenizeForStorage();
}
