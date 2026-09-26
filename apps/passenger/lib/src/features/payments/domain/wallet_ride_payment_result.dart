class WalletRidePaymentResult {
  const WalletRidePaymentResult({
    required this.rideState,
    required this.walletBalanceCents,
    required this.duplicatePayment,
    required this.paymentConfirmed,
    this.paymentRefunded = false,
    this.dispatchStatus,
  });

  factory WalletRidePaymentResult.fromJson(Map<String, dynamic> json) {
    final ride = json['ride'];
    if (ride is! Map<String, dynamic>) {
      throw const FormatException('Resposta da corrida inválida.');
    }

    final payment = json['payment'];
    final paymentStatus = payment is Map<String, dynamic>
        ? payment['status'] as String?
        : null;

    return WalletRidePaymentResult(
      rideState: ride['state'] as String,
      walletBalanceCents: (json['walletBalanceCents'] as num).toInt(),
      duplicatePayment: json['duplicatePayment'] as bool? ?? false,
      paymentConfirmed: paymentStatus == 'paid',
      paymentRefunded: paymentStatus == 'refunded',
      dispatchStatus: json['dispatchStatus'] as String?,
    );
  }

  final String rideState;
  final int walletBalanceCents;
  final bool duplicatePayment;
  final bool paymentConfirmed;
  final bool paymentRefunded;
  final String? dispatchStatus;
}
