class FareEstimate {
  const FareEstimate({
    required this.amountCents,
    this.pricingRuleId,
    this.corridorMinimumApplied = false,
  });

  final int amountCents;
  final String? pricingRuleId;
  final bool corridorMinimumApplied;

  double get amount => amountCents / 100;

  String get formatted {
    final reais = amountCents ~/ 100;
    final cents = (amountCents % 100).toString().padLeft(2, '0');
    return 'R\$ $reais,$cents';
  }
}
