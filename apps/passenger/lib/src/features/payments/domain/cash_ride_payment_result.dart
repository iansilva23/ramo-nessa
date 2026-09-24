class CashRidePaymentResult {
  const CashRidePaymentResult({
    required this.rideState,
    required this.totalAmountCents,
    required this.duplicateAuthorization,
    this.dispatchStatus,
  });

  factory CashRidePaymentResult.fromJson(Map<String, dynamic> json) {
    final ride = json['ride'];
    final authorization = json['authorization'];
    if (
      ride is! Map<String, dynamic> ||
      authorization is! Map<String, dynamic> ||
      authorization['method'] != 'cash' ||
      authorization['status'] != 'authorized'
    ) {
      throw const FormatException(
        'Resposta de autorização em dinheiro inválida.',
      );
    }

    final amount = authorization['amountCents'];
    if (amount is! num) {
      throw const FormatException(
        'Valor da autorização em dinheiro inválido.',
      );
    }

    return CashRidePaymentResult(
      rideState: ride['state'] as String,
      totalAmountCents: amount.toInt(),
      duplicateAuthorization:
          json['duplicateAuthorization'] as bool? ?? false,
      dispatchStatus: json['dispatchStatus'] as String?,
    );
  }

  final String rideState;
  final int totalAmountCents;
  final bool duplicateAuthorization;
  final String? dispatchStatus;
}
