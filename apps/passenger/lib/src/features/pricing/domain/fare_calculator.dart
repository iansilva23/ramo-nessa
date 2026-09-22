import '../../home/domain/service_type.dart';
import '../../map/domain/route_info.dart';
import 'fare_estimate.dart';

class FareRateCard {
  const FareRateCard({
    required this.baseFareCents,
    required this.perKmCents,
    required this.perMinuteCents,
    required this.minimumFareCents,
  });

  final int baseFareCents;
  final int perKmCents;
  final int perMinuteCents;
  final int minimumFareCents;
}

class ZonePairFareRule {
  const ZonePairFareRule({
    required this.id,
    required this.zoneAId,
    required this.zoneBId,
    required this.minimumFareCents,
  });

  final String id;
  final String zoneAId;
  final String zoneBId;
  final Map<ServiceType, int> minimumFareCents;

  bool matches({
    required String originZoneId,
    required String destinationZoneId,
  }) {
    return (originZoneId == zoneAId && destinationZoneId == zoneBId) ||
        (originZoneId == zoneBId && destinationZoneId == zoneAId);
  }

  int? minimumFor(ServiceType service) => minimumFareCents[service];
}

/// Motor determinístico de estimativa local.
///
/// A tabela abaixo é a proposta técnica do piloto e continua provisória até a
/// configuração autoritativa existir no backend/Admin. O cálculo local existe
/// para UX e testes; o servidor deverá recalcular e assinar a cotação final.
abstract final class FareCalculator {
  static const _rates = <ServiceType, FareRateCard>{
    ServiceType.car: FareRateCard(
      baseFareCents: 650,
      perKmCents: 250,
      perMinuteCents: 25,
      minimumFareCents: 1200,
    ),
    ServiceType.moto: FareRateCard(
      baseFareCents: 400,
      perKmCents: 150,
      perMinuteCents: 18,
      minimumFareCents: 800,
    ),
    ServiceType.delivery: FareRateCard(
      baseFareCents: 500,
      perKmCents: 180,
      perMinuteCents: 18,
      minimumFareCents: 950,
    ),
  };

  /// Pisos provisórios para os principais corredores.
  ///
  /// Eles evitam que diferenças de roteamento/tempo em vias de areia façam uma
  /// corrida intermunicipal/interzona cair para um valor incompatível com a
  /// operação local. Não substituem regras legais de acesso ou elegibilidade do
  /// motorista.
  static const _zonePairRules = <ZonePairFareRule>[
    ZonePairFareRule(
      id: 'jeri-prea',
      zoneAId: 'jericoacoara',
      zoneBId: 'prea',
      minimumFareCents: {
        ServiceType.car: 5500,
        ServiceType.moto: 3000,
        ServiceType.delivery: 3500,
      },
    ),
    ZonePairFareRule(
      id: 'jeri-jijoca',
      zoneAId: 'jericoacoara',
      zoneBId: 'jijoca',
      minimumFareCents: {
        ServiceType.car: 8000,
        ServiceType.moto: 5000,
        ServiceType.delivery: 6000,
      },
    ),
    ZonePairFareRule(
      id: 'jijoca-prea',
      zoneAId: 'jijoca',
      zoneBId: 'prea',
      minimumFareCents: {
        ServiceType.car: 8500,
        ServiceType.moto: 5500,
        ServiceType.delivery: 6500,
      },
    ),
  ];

  static FareRateCard rateFor(ServiceType service) => _rates[service]!;

  static ZonePairFareRule? zoneRuleFor({
    required String? originZoneId,
    required String? destinationZoneId,
  }) {
    if (originZoneId == null || destinationZoneId == null) {
      return null;
    }

    for (final rule in _zonePairRules) {
      if (rule.matches(
        originZoneId: originZoneId,
        destinationZoneId: destinationZoneId,
      )) {
        return rule;
      }
    }

    return null;
  }

  static FareEstimate estimate({
    required ServiceType service,
    required RouteInfo route,
    String? originZoneId,
    String? destinationZoneId,
  }) {
    final rate = rateFor(service);
    final distanceKm = route.distanceMeters / 1000;
    final durationMinutes = route.duration.inSeconds / 60;

    final calculated = rate.baseFareCents +
        distanceKm * rate.perKmCents +
        durationMinutes * rate.perMinuteCents;

    final zoneRule = zoneRuleFor(
      originZoneId: originZoneId,
      destinationZoneId: destinationZoneId,
    );
    final corridorFloor = zoneRule?.minimumFor(service);

    var effectiveMinimum = rate.minimumFareCents;
    if (corridorFloor != null && corridorFloor > effectiveMinimum) {
      effectiveMinimum = corridorFloor;
    }

    final withMinimum = calculated > effectiveMinimum
        ? calculated
        : effectiveMinimum.toDouble();

    // Evita centavos quebrados e mantém a interface local mais simples.
    final roundedCents = (withMinimum / 10).ceil() * 10;

    return FareEstimate(
      amountCents: roundedCents,
      pricingRuleId: zoneRule?.id,
      corridorMinimumApplied:
          corridorFloor != null && calculated <= corridorFloor,
    );
  }
}
