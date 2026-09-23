import '../domain/wallet_ride_payment_result.dart';

abstract interface class PassengerPaymentService {
  Future<int> walletBalanceCents();

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
