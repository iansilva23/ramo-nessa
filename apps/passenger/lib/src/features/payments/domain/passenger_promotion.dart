class PassengerPromotionCampaign {
  const PassengerPromotionCampaign({
    required this.id,
    required this.code,
    required this.name,
    required this.kind,
    required this.categories,
    this.valueCents,
    this.percentBps,
    this.maxDiscountCents,
    this.fixedDriverFareCents,
    this.startsAt,
    this.endsAt,
  });

  factory PassengerPromotionCampaign.fromJson(
    Map<String, dynamic> json,
  ) {
    final categories = json['categories'];
    return PassengerPromotionCampaign(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      kind: json['kind'] as String,
      valueCents: (json['valueCents'] as num?)?.toInt(),
      percentBps: (json['percentBps'] as num?)?.toInt(),
      maxDiscountCents:
          (json['maxDiscountCents'] as num?)?.toInt(),
      fixedDriverFareCents:
          (json['fixedDriverFareCents'] as num?)?.toInt(),
      categories: categories is List
          ? categories.whereType<String>().toList(growable: false)
          : const <String>[],
      startsAt: _dateOrNull(json['startsAt']),
      endsAt: _dateOrNull(json['endsAt']),
    );
  }

  final String id;
  final String code;
  final String name;
  final String kind;
  final int? valueCents;
  final int? percentBps;
  final int? maxDiscountCents;
  final int? fixedDriverFareCents;
  final List<String> categories;
  final DateTime? startsAt;
  final DateTime? endsAt;

  bool get isWalletCredit => kind == 'wallet_credit';

  String get benefitLabel {
    switch (kind) {
      case 'wallet_credit':
        return valueCents == null
            ? 'Crédito promocional'
            : '+ ' + formatCents(valueCents!) + ' na carteira';
      case 'fixed_discount':
        return valueCents == null
            ? 'Desconto'
            : formatCents(valueCents!) + ' de desconto';
      case 'percent_discount':
        final percent = ((percentBps ?? 0) / 100)
            .toStringAsFixed(
              (percentBps ?? 0) % 100 == 0 ? 0 : 2,
            );
        final limit = maxDiscountCents == null
            ? ''
            : ' · até ' + formatCents(maxDiscountCents!);
        return percent + '% de desconto' + limit;
      case 'free_ride':
        return 'Corrida grátis';
      case 'fixed_driver_fare':
        return fixedDriverFareCents == null
            ? 'Tarifa promocional'
            : 'Corrida por ' + formatCents(fixedDriverFareCents!);
      default:
        return 'Benefício promocional';
    }
  }

  static String formatCents(int cents) {
    final reais = cents ~/ 100;
    final centavos = (cents % 100).toString().padLeft(2, '0');
    return 'R\$ ' + reais.toString() + ',' + centavos;
  }

  static DateTime? _dateOrNull(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value);
  }
}

class PassengerPromotionPreference {
  const PassengerPromotionPreference({
    required this.campaign,
    required this.updatedAt,
  });

  factory PassengerPromotionPreference.fromJson(
    Map<String, dynamic> json,
  ) {
    final campaign = json['campaign'];
    if (campaign is! Map<String, dynamic>) {
      throw const FormatException('Cupom salvo inválido.');
    }
    final updatedAt = json['updatedAt'];
    if (updatedAt is! String || updatedAt.isEmpty) {
      throw const FormatException('Data do cupom salvo inválida.');
    }
    return PassengerPromotionPreference(
      campaign: PassengerPromotionCampaign.fromJson(campaign),
      updatedAt: DateTime.parse(updatedAt),
    );
  }

  final PassengerPromotionCampaign campaign;
  final DateTime updatedAt;
}

class PassengerPromotionSaveResult {
  const PassengerPromotionSaveResult({
    required this.mode,
    this.preference,
    this.campaign,
    this.walletCreditCents,
    this.walletBalanceCents,
  });

  factory PassengerPromotionSaveResult.fromJson(
    Map<String, dynamic> json,
  ) {
    final mode = json['mode'] as String? ?? '';
    if (mode == 'ride_coupon') {
      final preference = json['preference'];
      if (preference is! Map<String, dynamic>) {
        throw const FormatException('Cupom salvo inválido.');
      }
      return PassengerPromotionSaveResult(
        mode: mode,
        preference: PassengerPromotionPreference.fromJson(preference),
      );
    }

    if (mode == 'wallet_credit') {
      final campaign = json['campaign'];
      if (campaign is! Map<String, dynamic>) {
        throw const FormatException('Crédito promocional inválido.');
      }
      return PassengerPromotionSaveResult(
        mode: mode,
        campaign: PassengerPromotionCampaign.fromJson(campaign),
        walletCreditCents:
            (json['walletCreditCents'] as num?)?.toInt(),
        walletBalanceCents:
            (json['walletBalanceCents'] as num?)?.toInt(),
      );
    }

    throw const FormatException('Resposta de cupom inválida.');
  }

  final String mode;
  final PassengerPromotionPreference? preference;
  final PassengerPromotionCampaign? campaign;
  final int? walletCreditCents;
  final int? walletBalanceCents;

  bool get creditedWallet => mode == 'wallet_credit';
}

class FullyPromotionalRidePaymentResult {
  const FullyPromotionalRidePaymentResult({
    required this.dispatchStatus,
    required this.paymentConfirmed,
    required this.rideJson,
  });

  factory FullyPromotionalRidePaymentResult.fromJson(
    Map<String, dynamic> json,
  ) {
    final ride = json['ride'];
    if (ride is! Map<String, dynamic>) {
      throw const FormatException('Corrida promocional inválida.');
    }
    return FullyPromotionalRidePaymentResult(
      dispatchStatus:
          json['dispatchStatus'] as String? ?? 'PENDING_RETRY',
      paymentConfirmed: json['paymentConfirmed'] == true,
      rideJson: ride,
    );
  }

  final String dispatchStatus;
  final bool paymentConfirmed;
  final Map<String, dynamic> rideJson;
}
