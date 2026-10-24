import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_route_info.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/driver_route_refresh_policy.dart';

void main() {
  const route = DriverRouteInfo(
    points: [
      LatLng(-2.8200, -40.4140),
      LatLng(-2.8100, -40.4140),
      LatLng(-2.8000, -40.4140),
    ],
    distanceMeters: 2200,
    duration: Duration(minutes: 5),
  );

  test('não recalcula continuamente quando motorista segue na rota', () {
    final last = DateTime(2026, 9, 25, 8);

    expect(
      DriverRouteRefreshPolicy.shouldRefresh(
        now: last.add(const Duration(seconds: 20)),
        currentPosition: const LatLng(-2.8150, -40.4140),
        currentRoute: route,
        lastAttemptAt: last,
      ),
      isFalse,
    );

    expect(
      DriverRouteRefreshPolicy.shouldRefresh(
        now: last.add(const Duration(seconds: 91)),
        currentPosition: const LatLng(-2.8150, -40.4140),
        currentRoute: route,
        lastAttemptAt: last,
      ),
      isTrue,
    );
  });

  test('recalcula cedo quando motorista sai da rota', () {
    final last = DateTime(2026, 9, 25, 8);

    expect(
      DriverRouteRefreshPolicy.shouldRefresh(
        now: last.add(const Duration(seconds: 16)),
        currentPosition: const LatLng(-2.8150, -40.4125),
        currentRoute: route,
        lastAttemptAt: last,
      ),
      isTrue,
    );
  });

  test('limite mínimo evita rajada de chamadas mesmo fora da rota', () {
    final last = DateTime(2026, 9, 25, 8);

    expect(
      DriverRouteRefreshPolicy.shouldRefresh(
        now: last.add(const Duration(seconds: 5)),
        currentPosition: const LatLng(-2.8150, -40.4125),
        currentRoute: route,
        lastAttemptAt: last,
      ),
      isFalse,
    );
  });

  test('aceite e início não aceitam resposta atrasada da rota anterior', () {
    expect(DriverRouteRefreshPolicy.isCurrentRouteResponse(
      requestId: 2, latestRequestId: 2,
      requestedRideId: 'ride-1', activeRideId: 'ride-1',
      requestedDropoff: false, currentDropoff: false,
    ), isTrue);

    // Passenger already collected: previous route was to pickup.
    expect(DriverRouteRefreshPolicy.isCurrentRouteResponse(
      requestId: 2, latestRequestId: 2,
      requestedRideId: 'ride-1', activeRideId: 'ride-1',
      requestedDropoff: false, currentDropoff: true,
    ), isFalse);

    // Another refresh superseded the old route, even in the same ride.
    expect(DriverRouteRefreshPolicy.isCurrentRouteResponse(
      requestId: 2, latestRequestId: 3,
      requestedRideId: 'ride-1', activeRideId: 'ride-1',
      requestedDropoff: true, currentDropoff: true,
    ), isFalse);

    // The ride has ended or another one was accepted.
    expect(DriverRouteRefreshPolicy.isCurrentRouteResponse(
      requestId: 4, latestRequestId: 4,
      requestedRideId: 'ride-1', activeRideId: null,
      requestedDropoff: true, currentDropoff: false,
    ), isFalse);
    expect(DriverRouteRefreshPolicy.isCurrentRouteResponse(
      requestId: 4, latestRequestId: 4,
      requestedRideId: 'ride-1', activeRideId: 'ride-2',
      requestedDropoff: false, currentDropoff: false,
    ), isFalse);
  });

  test('mudança de etapa pode forçar rota imediatamente', () {
    final last = DateTime(2026, 9, 25, 8);

    expect(
      DriverRouteRefreshPolicy.shouldRefresh(
        now: last.add(const Duration(seconds: 2)),
        currentPosition: const LatLng(-2.8150, -40.4140),
        currentRoute: route,
        lastAttemptAt: last,
        force: true,
      ),
      isTrue,
    );
  });
}
