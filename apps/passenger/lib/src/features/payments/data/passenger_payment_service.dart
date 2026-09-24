import '../domain/cash_ride_authorization_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/cash_ride_payment_result.dart';
import '../domain/payment_policy_snapshot.dart';
import '../domain/wallet_ride_payment_result.dart';

abstract interface class PassengerPaymentService {
  Future<PassengerPaymentPolicy> paymentPolicy();

  Future<int> walletBalanceCents();

  Future<CashRideAuthorizationResult> authorizeCashRide({
    required String rideId,
  });

  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  });
}

class PassengerPaymentException implements Exception {
  const PassengerPaymentException(this.message);

  final String message;

  @override
  String toString() => message;
}
