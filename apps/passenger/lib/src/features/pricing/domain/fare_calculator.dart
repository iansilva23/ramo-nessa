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

/// Motor determinístico de estimativa.
///
/// Os coeficientes abaixo são uma tabela operacional inicial centralizada para
/// desenvolvimento do MVP. Eles NÃO representam uma tabela comercial aprovada.
/// Antes do lançamento, os mesmos campos devem vir do backend/admin.
abstract final class FareCalculator {
  static const _rates = <ServiceType, FareRateCard>{
    ServiceType.car: FareRateCard(
      baseFareCents: 650,
      perKmCents: 280,
      perMinuteCents: 35,
      minimumFareCents: 1200,
    ),
    ServiceType.moto: FareRateCard(
      baseFareCents: 400,
      perKmCents: 165,
      perMinuteCents: 20,
      minimumFareCents: 800,
    ),
    ServiceType.delivery: FareRateCard(
      baseFareCents: 500,
      perKmCents: 195,
      perMinuteCents: 20,
      minimumFareCents: 950,
    ),
  };

  static FareRateCard rateFor(ServiceType service) => _rates[service]!;

  static FareEstimate estimate({
    required ServiceType service,
    required RouteInfo route,
  }) {
    final rate = rateFor(service);
    final distanceKm = route.distanceMeters / 1000;
    final durationMinutes = route.duration.inSeconds / 60;

    final calculated = rate.baseFareCents +
        distanceKm * rate.perKmCents +
        durationMinutes * rate.perMinuteCents;

    final withMinimum = calculated > rate.minimumFareCents
        ? calculated
        : rate.minimumFareCents.toDouble();

    // Evita centavos quebrados e mantém a interface local mais simples.
    final roundedCents = (withMinimum / 10).ceil() * 10;

    return FareEstimate(amountCents: roundedCents);
  }
}
