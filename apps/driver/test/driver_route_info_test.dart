import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_route_info.dart';

void main() {
  const route = DriverRouteInfo(
    points: [
      LatLng(-2.8200, -40.4140),
      LatLng(-2.8150, -40.4140),
      LatLng(-2.8100, -40.4140),
      LatLng(-2.8050, -40.4140),
    ],
    distanceMeters: 1800,
    duration: Duration(minutes: 5),
    maneuvers: [
      DriverRouteManeuver(
        instruction: 'Siga em frente.',
        distanceMeters: 600,
        duration: Duration(minutes: 2),
        beginShapeIndex: 0,
        endShapeIndex: 1,
      ),
      DriverRouteManeuver(
        instruction: 'Vire à direita.',
        distanceMeters: 1200,
        duration: Duration(minutes: 3),
        beginShapeIndex: 1,
        endShapeIndex: 3,
      ),
    ],
  );

  test('mantém a primeira manobra antes do fim da etapa', () {
    expect(
      route
          .nextManeuverFor(
            const LatLng(-2.8198, -40.4140),
          )
          ?.instruction,
      'Siga em frente.',
    );
  });

  test('avança para a próxima manobra usando a posição na polilinha', () {
    expect(
      route
          .nextManeuverFor(
            const LatLng(-2.8120, -40.4140),
          )
          ?.instruction,
      'Vire à direita.',
    );
  });

  test('fallback sem índices preserva instrução disponível', () {
    const fallback = DriverRouteInfo(
      points: [
        LatLng(-2.8200, -40.4140),
        LatLng(-2.8100, -40.4140),
      ],
      distanceMeters: 1000,
      duration: Duration(minutes: 3),
      maneuvers: [
        DriverRouteManeuver(
          instruction: 'Continue pela rota.',
          distanceMeters: 1000,
          duration: Duration(minutes: 3),
        ),
      ],
    );

    expect(
      fallback
          .nextManeuverFor(
            const LatLng(-2.8150, -40.4140),
          )
          ?.instruction,
      'Continue pela rota.',
    );
  });
}
