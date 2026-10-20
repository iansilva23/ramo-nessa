import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/tracking_map_transition_policy.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';

void main() {
  test('atualizações de outra corrida são ignoradas', () {
    expect(TrackingMapTransitionPolicy.isExpectedRide(
      expectedRideId: 'ride-1', receivedRideId: 'ride-1',
    ), isTrue);
    expect(TrackingMapTransitionPolicy.isExpectedRide(
      expectedRideId: 'ride-1', receivedRideId: 'ride-2',
    ), isFalse);
    expect(TrackingMapTransitionPolicy.isExpectedRide(
      expectedRideId: '', receivedRideId: '',
    ), isFalse);
  });

  test('GPS só aceita pares finitos e dentro dos limites terrestres', () {
    for (final point in <(double?, double?)>[
      (null, -40.41),
      (-2.82, null),
      (double.nan, -40.41),
      (-2.82, double.infinity),
      (double.negativeInfinity, -40.41),
      (91, -40.41),
      (-91, -40.41),
      (-2.82, 181),
      (-2.82, -181),
      (0, 0),
    ]) {
      expect(TrackingMapTransitionPolicy.isUsableGps(point.$1, point.$2),
          isFalse, reason: 'GPS ${point.$1}, ${point.$2}');
    }
    for (final point in <(double, double)>[
      (-2.82017, -40.41467),
      (-2.89860, -40.45060),
      (-2.80023, -40.51638),
      (-2.906425, -40.357338),
      (90, 180),
      (-90, -180),
    ]) {
      expect(TrackingMapTransitionPolicy.isUsableGps(point.$1, point.$2),
          isTrue, reason: 'GPS válido ${point.$1}, ${point.$2}');
    }
  });

  test('busca, aceite e chegada pertencem à mesma etapa de embarque', () {
    for (final state in [
      'PAID', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING', 'DRIVER_ARRIVED',
    ]) {
      expect(
        TrackingMapTransitionPolicy.stageFor(
          rideState: state, terminal: false,
        ),
        'to-pickup',
      );
    }
    expect(
      TrackingMapTransitionPolicy.stageFor(
        rideState: 'IN_PROGRESS', terminal: false,
      ),
      'to-dropoff',
    );
    expect(
      TrackingMapTransitionPolicy.stageFor(
        rideState: 'COMPLETED', terminal: true,
      ),
      'terminal',
    );
  });

  test('localização atualiza marcador sem mover a câmera em cada polling', () {
    expect(TrackingMapTransitionPolicy.shouldCenterInitially(
      mapReady: true, alreadyCentered: false, hasPosition: true,
    ), isTrue);
    expect(TrackingMapTransitionPolicy.shouldCenterInitially(
      mapReady: true, alreadyCentered: true, hasPosition: true,
    ), isFalse);
    expect(TrackingMapTransitionPolicy.shouldCenterInitially(
      mapReady: false, alreadyCentered: false, hasPosition: true,
    ), isFalse);
    expect(TrackingMapTransitionPolicy.shouldCenterInitially(
      mapReady: true, alreadyCentered: false, hasPosition: false,
    ), isFalse);
  });

  test('enquadra uma vez o trajeto ao embarque e novamente ao iniciar viagem', () {
    expect(TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: true, terminal: false, hasDriver: true,
      hasTarget: true, routePointCount: 3,
      stage: 'to-pickup', lastFramedStage: null,
    ), isTrue);
    expect(TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: true, terminal: false, hasDriver: true,
      hasTarget: true, routePointCount: 3,
      stage: 'to-pickup', lastFramedStage: 'to-pickup',
    ), isFalse);
    expect(TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: true, terminal: false, hasDriver: true,
      hasTarget: true, routePointCount: 3,
      stage: 'to-dropoff', lastFramedStage: 'to-pickup',
    ), isTrue);
    expect(TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: true, terminal: true, hasDriver: true,
      hasTarget: true, routePointCount: 3,
      stage: 'terminal', lastFramedStage: null,
    ), isFalse);
    expect(TrackingMapTransitionPolicy.shouldFrameRoute(
      mapReady: true, terminal: false, hasDriver: true,
      hasTarget: false, routePointCount: 3,
      stage: 'to-pickup', lastFramedStage: null,
    ), isFalse);
  });

  test('resposta tardia do embarque não substitui rota do destino', () {
    expect(TrackingMapTransitionPolicy.isCurrentRouteResponse(
      requestEpoch: 4, latestEpoch: 4,
      requestedStage: 'to-pickup', latestStage: 'to-pickup',
    ), isTrue);
    expect(TrackingMapTransitionPolicy.isCurrentRouteResponse(
      requestEpoch: 4, latestEpoch: 5,
      requestedStage: 'to-pickup', latestStage: 'to-dropoff',
    ), isFalse);
    expect(TrackingMapTransitionPolicy.isCurrentRouteResponse(
      requestEpoch: 5, latestEpoch: 5,
      requestedStage: 'to-pickup', latestStage: 'terminal',
    ), isFalse);
  });

  test('linha da rota não reinicia animação a cada GPS do motorista', () {
    expect(ramoShouldRevealRoute(
      previousPointCount: 0, nextPointCount: 4,
      previousPhase: 'to-pickup', nextPhase: 'to-pickup',
    ), isTrue);
    expect(ramoShouldRevealRoute(
      previousPointCount: 4, nextPointCount: 5,
      previousPhase: 'to-pickup', nextPhase: 'to-pickup',
    ), isFalse);
    expect(ramoShouldRevealRoute(
      previousPointCount: 4, nextPointCount: 5,
      previousPhase: 'to-pickup', nextPhase: 'to-dropoff',
    ), isTrue);
    // Outside tracking, selecting a new route retains the original animation.
    expect(ramoShouldRevealRoute(
      previousPointCount: 4, nextPointCount: 5,
      previousPhase: null, nextPhase: null,
    ), isTrue);
  });
}
