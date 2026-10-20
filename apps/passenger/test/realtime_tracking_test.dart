import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/route_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
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

  testWidgets('fluxo real da tela anima busca até viagem em celular 320px',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final realtime = _FakeRealtimeService();

    await tester.pumpWidget(MaterialApp(
      home: RideTrackingScreen(
        rideId: 'ride-1',
        remainingWalletCents: null,
        trackingService: _FakeTrackingService(),
        realtimeService: realtime,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Procurando motorista'), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'estado inicial de busca em 320px');

    for (final step in <(String, String)>[
      ('DRIVER_ASSIGNED', 'Seu motorista está a caminho'),
      ('DRIVER_ARRIVED', 'Seu motorista chegou'),
      ('IN_PROGRESS', 'Corrida em andamento'),
      ('COMPLETED', 'Corrida finalizada'),
    ]) {
      realtime.add(PassengerRideTrackingSnapshot(
        rideId: 'ride-1',
        state: step.$1,
        category: 'car',
        pickupLatitude: -2.82,
        pickupLongitude: -40.41,
        dropoffLatitude: -2.8986,
        dropoffLongitude: -40.4506,
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text(step.$2), findsOneWidget);
      expect(tester.takeException(), isNull,
          reason: 'estado ${step.$1} em tela de 320px');
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });

  testWidgets('polling HTTP atrasado não reverte motorista chegou ou corrida iniciada',
      (tester) async {
    final delayed = _DelayedTrackingService();
    final realtime = _FakeRealtimeService();
    await tester.pumpWidget(MaterialApp(
      home: RideTrackingScreen(
        rideId: 'ride-1',
        remainingWalletCents: null,
        trackingService: delayed,
        realtimeService: realtime,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pump();
    // The first HTTP request is deliberately held while realtime advances.
    realtime.add(const PassengerRideTrackingSnapshot(
      rideId: 'ride-1',
      state: 'DRIVER_ARRIVED',
      category: 'car',
      pickupLatitude: -2.82,
      pickupLongitude: -40.41,
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Seu motorista chegou'), findsOneWidget);

    delayed.complete(const PassengerRideTrackingSnapshot(
      rideId: 'ride-1',
      state: 'SEARCHING_DRIVER',
      category: 'car',
      pickupLatitude: -2.82,
      pickupLongitude: -40.41,
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Seu motorista chegou'), findsOneWidget);
    expect(find.text('Procurando motorista'), findsNothing);

    realtime.add(const PassengerRideTrackingSnapshot(
      rideId: 'ride-1',
      state: 'IN_PROGRESS',
      category: 'car',
      pickupLatitude: -2.82,
      pickupLongitude: -40.41,
      dropoffLatitude: -2.8986,
      dropoffLongitude: -40.4506,
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Corrida em andamento'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });

  testWidgets('sem motorista, cancelamento e reembolso não cortam tela 320px',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final realtime = _FakeRealtimeService();
    await tester.pumpWidget(MaterialApp(
      home: RideTrackingScreen(
        rideId: 'ride-1',
        remainingWalletCents: null,
        trackingService: _FakeTrackingService(),
        realtimeService: realtime,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pump();
    for (final item in <(String, String)>[
      ('NO_DRIVER_FOUND', 'Nenhum motorista disponível nesta rodada'),
      ('REFUND_PENDING', 'Estorno em processamento'),
      ('REFUNDED', 'Pagamento devolvido'),
    ]) {
      realtime.add(PassengerRideTrackingSnapshot(
        rideId: 'ride-1', state: item.$1, category: 'car',
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text(item.$2), findsWidgets);
      expect(tester.takeException(), isNull,
          reason: 'estado ${item.$1} em viewport 320px');
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });

  testWidgets('evento de outra corrida não altera status ou dados exibidos',
      (tester) async {
    final realtime = _FakeRealtimeService();
    await tester.pumpWidget(MaterialApp(
      home: RideTrackingScreen(
        rideId: 'ride-1', remainingWalletCents: null,
        trackingService: _FakeTrackingService(),
        realtimeService: realtime,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pump();
    expect(find.text('Procurando motorista'), findsOneWidget);

    realtime.add(const PassengerRideTrackingSnapshot(
      rideId: 'ride-2', state: 'COMPLETED', category: 'car',
      pickupLatitude: -2.82, pickupLongitude: -40.41,
      driver: PassengerDriverProfile(
        id: 'driver-of-other-ride',
        displayName: 'Não mostrar outro motorista', ratingCount: 0,
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Procurando motorista'), findsOneWidget);
    expect(find.text('Corrida finalizada'), findsNothing);
    expect(find.text('Não mostrar outro motorista'), findsNothing);

    realtime.add(const PassengerRideTrackingSnapshot(
      rideId: 'ride-1', state: 'DRIVER_ARRIVED', category: 'car',
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Seu motorista chegou'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });

  testWidgets('GPS inválido ou antigo nunca consulta o provedor de rotas',
      (tester) async {
    final realtime = _FakeRealtimeService();
    final routes = _CountingRouteService();
    await tester.pumpWidget(MaterialApp(
      home: RideTrackingScreen(
        rideId: 'ride-1', remainingWalletCents: null,
        trackingService: _FakeTrackingService(),
        realtimeService: realtime,
        routeService: routes,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pump();

    for (final point in <(double, double, bool)>[
      (double.nan, -40.41467, false),
      (-2.82, double.infinity, false),
      (95, -40.41467, false),
      (0, 0, false),
      (-2.83, -40.42, true),
    ]) {
      realtime.add(PassengerRideTrackingSnapshot(
        rideId: 'ride-1', state: 'DRIVER_ARRIVING',
        category: 'car',
        pickupLatitude: -2.82017,
        pickupLongitude: -40.41467,
        driverLocation: PassengerDriverLocation(
          latitude: point.$1,
          longitude: point.$2,
          updatedAt: DateTime.now(),
          stale: point.$3,
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      final map = tester.widget<RamoLiveMap>(find.byType(RamoLiveMap));
      if (point.$3) {
        expect(map.driverPosition, isNotNull); // Stale marker remains flagged.
        expect(map.driverPositionStale, isTrue);
      } else {
        expect(map.driverPosition, isNull);
        expect(map.driverPositionStale, isTrue);
        expect(find.text('A posição do motorista está indisponível no momento.'),
            findsOneWidget);
      }
      expect(routes.calls, 0);
      expect(tester.takeException(), isNull);
    }
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
    final submitRating = find.text('Enviar avaliação');
    await tester.scrollUntilVisible(
      submitRating,
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    await tester.tap(submitRating);
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
  Future<List<PassengerRideChatMessage>> rideMessages(String rideId) async =>
      const [];

  @override
  Future<PassengerRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    return PassengerRideChatMessage(
      id: 'test-message',
      rideId: rideId,
      senderType: 'passenger',
      senderId: 'test-passenger',
      body: body,
      createdAt: DateTime(2026, 9, 26),
    );
  }

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

class _DelayedTrackingService extends _FakeTrackingService {
  final Completer<PassengerRideTrackingSnapshot> _delayed =
      Completer<PassengerRideTrackingSnapshot>();

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) =>
      _delayed.future;

  void complete(PassengerRideTrackingSnapshot snapshot) {
    _delayed.complete(snapshot);
  }
}

class _FakeTrackingService implements PassengerRideTrackingService {

  @override
  Future<List<PassengerRideChatMessage>> rideMessages(String rideId) async =>
      const [];

  @override
  Future<PassengerRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    return PassengerRideChatMessage(
      id: 'test-message',
      rideId: rideId,
      senderType: 'passenger',
      senderId: 'test-passenger',
      body: body,
      createdAt: DateTime(2026, 9, 26),
    );
  }
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

class _CountingRouteService implements RouteService {
  int calls = 0;

  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) {
    calls++;
    return Future<RouteInfo>.error(StateError('Invalid GPS sent to routing'));
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
