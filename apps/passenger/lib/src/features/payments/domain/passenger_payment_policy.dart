class PassengerPaymentPolicy {
  const PassengerPaymentPolicy({
    required this.cashEnabled,
    required this.allowedMethods,
    required this.paymentRequiredBeforeDispatch,
    required this.passengerWalletEnabled,
  });

  factory PassengerPaymentPolicy.fromJson(Map<String, dynamic> json) {
    final allowed = json['allowedMethods'];
    if (allowed is! List) {
      throw const FormatException(
        'Política de pagamentos sem métodos válidos.',
      );
    }

    final methods = allowed
        .whereType<String>()
        .map((method) => method.trim())
        .where((method) => method.isNotEmpty)
        .toSet();

    return PassengerPaymentPolicy(
      cashEnabled: json['cashEnabled'] as bool? ?? false,
      allowedMethods: methods,
      paymentRequiredBeforeDispatch:
          json['paymentRequiredBeforeDispatch'] as bool? ?? true,
      passengerWalletEnabled:
          json['passengerWalletEnabled'] as bool? ?? false,
    );
  }

  final bool cashEnabled;
  final Set<String> allowedMethods;
  final bool paymentRequiredBeforeDispatch;
  final bool passengerWalletEnabled;

  bool get cashAvailable =>
      cashEnabled && allowedMethods.contains('cash');
}
