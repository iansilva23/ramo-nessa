import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_realtime_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/ride_tracking_screen.dart';

void main() {
  testWidgets('tracking aplica atualização realtime sem esperar polling',
      (tester) async {
    final realtime = _FakeRealtimeService();

    await tester.pumpWidget(
      MaterialApp(
        home: RideTrackingScreen(
          rideId: 'ride-1',
          remainingWalletCents: 5000,
          trackingService: _FakeTrackingService(),
          realtimeService: realtime,
          networkTilesEnabled: false,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Procurando motorista'), findsOneWidget);

    realtime.add(
      PassengerRideTrackingSnapshot(
        rideId: 'ride-1',
        state: 'DRIVER_ARRIVING',
        category: 'car',
        pickupLatitude: -2.82,
        pickupLongitude: -40.41,
        driverLocation: PassengerDriverLocation(
          latitude: -2.83,
          longitude: -40.42,
          updatedAt: DateTime.now(),
          stale: false,
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Seu motorista está a caminho'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });

  testWidgets('passageiro avalia motorista após corrida concluída',
      (tester) async {
    final service = _RatingTrackingService();

    await tester.pumpWidget(
      MaterialApp(
        home: RideTrackingScreen(
          rideId: 'ride-completed',
          remainingWalletCents: 0,
          trackingService: service,
          networkTilesEnabled: false,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));

    expect(find.text('Corrida finalizada'), findsOneWidget);
    expect(find.text('Como foi sua corrida?'), findsOneWidget);

    await tester.tap(find.byTooltip('5 estrelas'));
    await tester.pump();
    await tester.tap(find.text('Enviar avaliação'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));

    expect(service.ratedStars, 5);
    expect(find.text('Avaliação enviada'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}

class _RatingTrackingService implements PassengerRideTrackingService {
  int? ratedStars;

  @override
  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  ) async {
    ratedStars = stars;
    return PassengerDriverRatingResult(
      stars: stars,
      ratingAverage: 5,
      ratingCount: 1,
      duplicate: false,
    );
  }

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    return const PassengerRideTrackingSnapshot(
      rideId: 'ride-completed',
      state: 'COMPLETED',
      category: 'car',
      pickupLatitude: -2.82,
      pickupLongitude: -40.41,
      driver: PassengerDriverProfile(
        id: 'driver-rating',
        displayName: 'Motorista Teste',
        ratingCount: 0,
      ),
    );
  }
}

class _FakeTrackingService implements PassengerRideTrackingService {
  @override
  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  ) async {
    return PassengerDriverRatingResult(
      stars: stars,
      ratingAverage: stars.toDouble(),
      ratingCount: 1,
      duplicate: false,
    );
  }

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    return const PassengerRideTrackingSnapshot(
      rideId: 'ride-1',
      state: 'SEARCHING_DRIVER',
      category: 'car',
      pickupLatitude: -2.82,
      pickupLongitude: -40.41,
    );
  }
}

class _FakeRealtimeService implements PassengerRideRealtimeService {
  final _controller =
      StreamController<PassengerRideTrackingSnapshot>.broadcast();

  void add(PassengerRideTrackingSnapshot snapshot) =>
      _controller.add(snapshot);

  Future<void> close() => _controller.close();

  @override
  Stream<PassengerRideTrackingSnapshot> watch(String rideId) =>
      _controller.stream;
}
