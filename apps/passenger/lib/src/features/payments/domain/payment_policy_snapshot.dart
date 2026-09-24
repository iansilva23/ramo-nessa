class PaymentPolicySnapshot {
  const PaymentPolicySnapshot({
    required this.cashEnabled,
    required this.allowedMethods,
  });

  factory PaymentPolicySnapshot.fromJson(Map<String, dynamic> json) {
    final methods = json['allowedMethods'];
    if (methods is! List) {
      throw const FormatException(
        'Política de pagamento retornou métodos inválidos.',
      );
    }

    return PaymentPolicySnapshot(
      cashEnabled: json['cashEnabled'] as bool? ?? false,
      allowedMethods: methods
          .whereType<String>()
          .map((method) => method.trim())
          .where((method) => method.isNotEmpty)
          .toSet(),
    );
  }

  final bool cashEnabled;
  final Set<String> allowedMethods;

  bool get cashAvailable =>
      cashEnabled && allowedMethods.contains('cash');
}
