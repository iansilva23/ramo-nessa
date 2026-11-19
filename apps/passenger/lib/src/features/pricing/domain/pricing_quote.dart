class PricingQuote {
  const PricingQuote._({
    required this.isExact,
    required this.ruleId,
    this.totalAmountCents,
    this.minTotalAmountCents,
    this.maxTotalAmountCents,
    this.platformCommissionCents,
    this.driverNetCents,
  });

  factory PricingQuote.fromJson(Map<String, dynamic> json) {
    final kind = json['kind'];
    final ruleId = json['ruleId'] as String? ?? 'unknown';

    if (kind == 'exact') {
      return PricingQuote._(
        isExact: true,
        ruleId: ruleId,
        totalAmountCents: (json['totalAmountCents'] as num).toInt(),
        platformCommissionCents:
            (json['platformCommissionCents'] as num?)?.toInt(),
        driverNetCents: (json['driverNetCents'] as num?)?.toInt(),
      );
    }

    if (kind == 'range') {
      return PricingQuote._(
        isExact: false,
        ruleId: ruleId,
        minTotalAmountCents: (json['minTotalAmountCents'] as num).toInt(),
        maxTotalAmountCents: (json['maxTotalAmountCents'] as num).toInt(),
      );
    }

    throw const FormatException('Resposta de preço inválida.');
  }

  final bool isExact;
  final String ruleId;
  final int? totalAmountCents;
  final int? minTotalAmountCents;
  final int? maxTotalAmountCents;
  final int? platformCommissionCents;
  final int? driverNetCents;

  String get formatted {
    if (isExact) {
      return _formatCents(totalAmountCents!);
    }

    return '${_formatCents(minTotalAmountCents!)}–'
        '${_formatCents(maxTotalAmountCents!)}';
  }

  static String _formatCents(int cents) {
    final reais = cents ~/ 100;
    final centavos = (cents % 100).toString().padLeft(2, '0');
    return 'R\$ $reais,$centavos';
  }
}
