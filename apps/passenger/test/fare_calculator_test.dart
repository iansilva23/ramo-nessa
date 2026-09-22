import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/fare_calculator.dart';

void main() {
  const route = RouteInfo(
    points: [
      LatLng(-2.80023, -40.51638),
      LatLng(-2.82017, -40.41467),
    ],
    distanceMeters: 2500,
    duration: Duration(minutes: 7),
  );

  test('preço base usa distância e tempo reais da rota', () {
    expect(
      FareCalculator.estimate(service: ServiceType.car, route: route).formatted,
      'R\$ 14,50',
    );
    expect(
      FareCalculator.estimate(service: ServiceType.moto, route: route).formatted,
      'R\$ 9,10',
    );
    expect(
      FareCalculator.estimate(
        service: ServiceType.delivery,
        route: route,
      ).formatted,
      'R\$ 10,80',
    );
  });

  test('tarifa mínima da categoria é respeitada', () {
    const shortRoute = RouteInfo(
      points: [
        LatLng(-2.80023, -40.51638),
        LatLng(-2.80050, -40.51600),
      ],
      distanceMeters: 100,
      duration: Duration(minutes: 1),
    );

    expect(
      FareCalculator.estimate(
        service: ServiceType.car,
        route: shortRoute,
      ).amountCents,
      1200,
    );
  });

  test('piso do corredor Jeri-Preá é aplicado nos dois sentidos', () {
    final outbound = FareCalculator.estimate(
      service: ServiceType.car,
      route: route,
      originZoneId: 'jericoacoara',
      destinationZoneId: 'prea',
    );
    final inbound = FareCalculator.estimate(
      service: ServiceType.car,
      route: route,
      originZoneId: 'prea',
      destinationZoneId: 'jericoacoara',
    );

    expect(outbound.amountCents, 5500);
    expect(outbound.pricingRuleId, 'jeri-prea');
    expect(outbound.corridorMinimumApplied, isTrue);
    expect(inbound.amountCents, 5500);
    expect(inbound.pricingRuleId, 'jeri-prea');
  });

  test('mesma zona não recebe piso de corredor', () {
    final estimate = FareCalculator.estimate(
      service: ServiceType.car,
      route: route,
      originZoneId: 'jericoacoara',
      destinationZoneId: 'jericoacoara',
    );

    expect(estimate.amountCents, 1450);
    expect(estimate.pricingRuleId, isNull);
    expect(estimate.corridorMinimumApplied, isFalse);
  });
}
