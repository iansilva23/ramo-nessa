import '../domain/card_ride_payment_result.dart';
import '../domain/cash_ride_authorization_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/passenger_promotion.dart';
import '../../rides/domain/prepared_ride.dart';
import '../domain/pix_ride_payment_result.dart';
import '../domain/wallet_ride_payment_result.dart';
import '../domain/wallet_topup_result.dart';

abstract interface class PassengerPaymentService {
  Future<PassengerPaymentPolicy> paymentPolicy();

  Future<int> walletBalanceCents();

  Future<PassengerPromotionPreference?> promotionPreference();

  Future<PassengerPromotionSaveResult> savePromotionCode(String code);

  Future<void> clearPromotionPreference();

  Future<PreparedRide> applyPromotionToRide({
    required String rideId,
    String? code,
  });

  Future<PreparedRide> removePromotionFromRide(String rideId);

  Future<FullyPromotionalRidePaymentResult> confirmFullyPromotionalRide(
    String rideId,
  );

  Future<PixWalletTopupResult> createPixWalletTopup({
    required int amountCents,
    required String idempotencyKey,
    required String payerEmail,
  });

  Future<WalletTopupStatus> walletTopupStatus(String topupId);

  Future<List<WalletTopupStatus>> walletTopups({int limit = 20});

  Future<PixRidePaymentResult> createPixRidePayment({
    required String rideId,
    required String idempotencyKey,
  });

  Future<CardRidePaymentResult> createCardRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String cardToken,
    required String paymentMethodId,
    required String paymentMethodType,
    int installments = 1,
  });

  Future<CashRideAuthorizationResult> authorizeCashRide({
    required String rideId,
    required String idempotencyKey,
  });

  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  });
}

class PassengerPaymentException implements Exception {
  const PassengerPaymentException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Checkout-only email; never an onboarding requirement.
abstract interface class PixEmailPaymentService {
  String? get checkoutEmail;
  Future<PixRidePaymentResult> createPixWithEmail({required String rideId, required String idempotencyKey, required String payerEmail});
}
