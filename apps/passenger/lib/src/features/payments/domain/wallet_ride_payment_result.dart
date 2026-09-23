class WalletRidePaymentResult {
  const WalletRidePaymentResult({
    required this.rideState,
    required this.walletBalanceCents,
    required this.duplicatePayment,
  });

  factory WalletRidePaymentResult.fromJson(Map<String, dynamic> json) {
    final ride = json['ride'];
    if (ride is! Map<String, dynamic>) {
      throw const FormatException('Resposta da corrida inválida.');
    }

    return WalletRidePaymentResult(
      rideState: ride['state'] as String,
      walletBalanceCents: (json['walletBalanceCents'] as num).toInt(),
      duplicatePayment: json['duplicatePayment'] as bool? ?? false,
    );
  }

  final String rideState;
  final int walletBalanceCents;
  final bool duplicatePayment;
}
