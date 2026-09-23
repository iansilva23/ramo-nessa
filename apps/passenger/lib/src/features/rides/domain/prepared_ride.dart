class PreparedRide {
  const PreparedRide({
    required this.id,
    required this.state,
    required this.baseAmountCents,
    required this.pickupCompensationCents,
    required this.totalAmountCents,
    required this.holdExpiresAt,
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

    return PreparedRide(
      id: ride['id'] as String,
      state: ride['state'] as String,
      baseAmountCents: (quote['baseAmountCents'] as num).toInt(),
      pickupCompensationCents:
          (quote['pickupCompensationCents'] as num).toInt(),
      totalAmountCents: (quote['totalAmountCents'] as num).toInt(),
      holdExpiresAt: DateTime.parse(hold),
    );
  }

  final String id;
  final String state;
  final int baseAmountCents;
  final int pickupCompensationCents;
  final int totalAmountCents;
  final DateTime holdExpiresAt;

  String get formattedTotal => formatCents(totalAmountCents);

  static String formatCents(int cents) {
    final reais = cents ~/ 100;
    final centavos = (cents % 100).toString().padLeft(2, '0');
    return 'R\$ $reais,$centavos';
  }
}
