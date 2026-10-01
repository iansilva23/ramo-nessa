class PreparedRidePromotion {
  const PreparedRidePromotion({
    required this.campaignId,
    required this.code,
    required this.name,
    required this.kind,
    required this.normalTotalCents,
    required this.discountCents,
    required this.passengerPayableCents,
  });

  factory PreparedRidePromotion.fromJson(
    Map<String, dynamic> json,
  ) {
    return PreparedRidePromotion(
      campaignId: json['campaignId'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      kind: json['kind'] as String,
      normalTotalCents:
          (json['normalTotalCents'] as num).toInt(),
      discountCents:
          (json['discountCents'] as num).toInt(),
      passengerPayableCents:
          (json['passengerPayableCents'] as num).toInt(),
    );
  }

  final String campaignId;
  final String code;
  final String name;
  final String kind;
  final int normalTotalCents;
  final int discountCents;
  final int passengerPayableCents;

  bool get isFree => passengerPayableCents == 0;
}

class PreparedRide {
  const PreparedRide({
    required this.id,
    required this.state,
    required this.baseAmountCents,
    required this.pickupCompensationCents,
    required this.totalAmountCents,
    required this.holdExpiresAt,
    this.promotion,
  });

  factory PreparedRide.fromJson(Map<String, dynamic> json) {
    final ride = json['ride'];
    if (ride is! Map<String, dynamic>) {
      throw const FormatException('Corrida preparada inválida.');
    }

    final quote = ride['quote'];
    if (quote is! Map<String, dynamic>) {
      throw const FormatException('Preço preparado inválido.');
    }

    final hold =
        (json['holdExpiresAt'] ?? ride['driverHoldExpiresAt']) as String?;

    if (hold == null || hold.isEmpty) {
      throw const FormatException('Reserva do motorista sem validade.');
    }

    final rawPromotion = ride['promotion'];
    final promotion = rawPromotion is Map<String, dynamic>
        ? PreparedRidePromotion.fromJson(rawPromotion)
        : null;

    return PreparedRide(
      id: ride['id'] as String,
      state: ride['state'] as String,
      baseAmountCents: (quote['baseAmountCents'] as num).toInt(),
      pickupCompensationCents:
          (quote['pickupCompensationCents'] as num).toInt(),
      totalAmountCents: (quote['totalAmountCents'] as num).toInt(),
      holdExpiresAt: DateTime.parse(hold),
      promotion: promotion,
    );
  }

  final String id;
  final String state;
  final int baseAmountCents;
  final int pickupCompensationCents;
  final int totalAmountCents;
  final DateTime holdExpiresAt;
  final PreparedRidePromotion? promotion;

  int get payableAmountCents =>
      promotion?.passengerPayableCents ?? totalAmountCents;

  int get discountCents => promotion?.discountCents ?? 0;

  String get formattedTotal => formatCents(totalAmountCents);

  String get formattedPayable => formatCents(payableAmountCents);

  static String formatCents(int cents) {
    final reais = cents ~/ 100;
    final centavos = (cents % 100).toString().padLeft(2, '0');
    return 'R\$ ' + reais.toString() + ',' + centavos;
  }
}
