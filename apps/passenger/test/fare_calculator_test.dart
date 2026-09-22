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

  test('preço é calculado com distância e tempo reais da rota', () {
    expect(
      FareCalculator.estimate(service: ServiceType.car, route: route).formatted,
      'R\$ 16,00',
    );
    expect(
      FareCalculator.estimate(service: ServiceType.moto, route: route).formatted,
      'R\$ 9,60',
    );
    expect(
      FareCalculator.estimate(
        service: ServiceType.delivery,
        route: route,
      ).formatted,
      'R\$ 11,30',
    );
  });

  test('tarifa mínima é respeitada', () {
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
}
