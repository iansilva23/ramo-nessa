class CashRideAuthorizationResult {
  const CashRideAuthorizationResult({
    required this.rideState,
    required this.amountCents,
    required this.duplicateAuthorization,
    required this.authorized,
    this.dispatchStatus,
  });

  factory CashRideAuthorizationResult.fromJson(
    Map<String, dynamic> json,
  ) {
    final ride = json['ride'];
    final authorization = json['authorization'];
    if (ride is! Map<String, dynamic> ||
        authorization is! Map<String, dynamic>) {
      throw const FormatException(
        'Autorização de pagamento em dinheiro inválida.',
      );
    }

    final method = authorization['method'];
    final status = authorization['status'];
    final amount = authorization['amountCents'];
    if (method != 'cash' || amount is! num) {
      throw const FormatException(
        'Autorização cash retornada pelo Core é inválida.',
      );
    }

    return CashRideAuthorizationResult(
      rideState: ride['state'] as String,
      amountCents: amount.toInt(),
      duplicateAuthorization:
          json['duplicateAuthorization'] as bool? ?? false,
      authorized: status == 'authorized',
      dispatchStatus: json['dispatchStatus'] as String?,
    );
  }

  final String rideState;
  final int amountCents;
  final bool duplicateAuthorization;
  final bool authorized;
  final String? dispatchStatus;
}
