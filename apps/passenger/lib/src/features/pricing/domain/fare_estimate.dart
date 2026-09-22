class FareEstimate {
  const FareEstimate({
    required this.amountCents,
  });

  final int amountCents;

  double get amount => amountCents / 100;

  String get formatted {
    final reais = amountCents ~/ 100;
    final cents = (amountCents % 100).toString().padLeft(2, '0');
    return 'R\$ $reais,$cents';
  }
}
