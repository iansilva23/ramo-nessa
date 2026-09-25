class PassengerPaymentPolicy {
  const PassengerPaymentPolicy({
    required this.cashEnabled,
    required this.allowedMethods,
    required this.paymentRequiredBeforeDispatch,
    required this.passengerWalletEnabled,
    this.pixPriceAdjustmentBps = 99,
    this.cardPriceAdjustmentBps = 498,
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
      pixPriceAdjustmentBps:
          (json['pixPriceAdjustmentBps'] as num?)?.toInt() ?? 0,
      cardPriceAdjustmentBps:
          (json['cardPriceAdjustmentBps'] as num?)?.toInt() ?? 0,
    );
  }

  final bool cashEnabled;
  final Set<String> allowedMethods;
  final bool paymentRequiredBeforeDispatch;
  final bool passengerWalletEnabled;
  final int pixPriceAdjustmentBps;
  final int cardPriceAdjustmentBps;

  bool get cashAvailable =>
      cashEnabled && allowedMethods.contains('cash');

  int pixTotalAmountCents(int baseFareAmountCents) {
    if (baseFareAmountCents <= 0 || pixPriceAdjustmentBps <= 0) {
      return baseFareAmountCents;
    }
    if (pixPriceAdjustmentBps >= 10000) {
      throw const FormatException(
        'Ajuste do preço no Pix inválido.',
      );
    }
    final denominator = 10000 - pixPriceAdjustmentBps;
    return ((baseFareAmountCents * 10000) + denominator - 1) ~/
        denominator;
  }

  int pixAdjustmentCents(int baseFareAmountCents) =>
      pixTotalAmountCents(baseFareAmountCents) - baseFareAmountCents;

  int cardTotalAmountCents(int baseFareAmountCents) {
    if (baseFareAmountCents <= 0 || cardPriceAdjustmentBps <= 0) {
      return baseFareAmountCents;
    }
    if (cardPriceAdjustmentBps >= 10000) {
      throw const FormatException(
        'Ajuste do preço no cartão inválido.',
      );
    }
    final denominator = 10000 - cardPriceAdjustmentBps;
    return ((baseFareAmountCents * 10000) + denominator - 1) ~/
        denominator;
  }

  int cardAdjustmentCents(int baseFareAmountCents) =>
      cardTotalAmountCents(baseFareAmountCents) - baseFareAmountCents;
}
