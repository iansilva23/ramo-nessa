import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/app.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/destination_search_screen.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/route_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_quote_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/pricing_quote.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/ride_preparation_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/prepared_ride.dart';

void main() {
  testWidgets('digitar destino não faz autocomplete no Nominatim', (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      MaterialApp(
        home: DestinationSearchScreen(searchService: search),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Jericoacoara');
    await tester.pump(const Duration(seconds: 2));

    expect(search.calls, 0);

    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(search.calls, 1);
    expect(find.widgetWithText(ListTile, 'Jericoacoara'), findsOneWidget);
  });

  testWidgets('rota prepara preço final e abre pagamento sem matching fake',
      (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: _FakeRouteService(),
        placeSearchService: search,
        pricingQuoteService: _FakePricingQuoteService(),
        ridePreparationService: _FakeRidePreparationService(),
        paymentService: _FakePassengerPaymentService(),
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Minha localização'), findsOneWidget);

    await tester.tap(find.text('Pra onde vamos?'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Jericoacoara');
    await tester.pump();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ListTile, 'Jericoacoara'));
    await tester.pumpAndSettle();

    expect(find.textContaining('2,5 km · 7 min'), findsOneWidget);

    await tester.drag(
      find.byType(ListView).last,
      const Offset(0, -260),
    );
    await tester.pumpAndSettle();

    expect(find.text('R\$ 42,00'), findsOneWidget);
    expect(find.text('preço confirmado pelo Core'), findsOneWidget);
    expect(find.text('Buggy'), findsOneWidget);
    expect(find.text('Carro'), findsNothing);

    await tester.tap(find.byTooltip('Adicionar passageiro'));
    await tester.pumpAndSettle();
    expect(find.text('R\$ 44,00'), findsOneWidget);

    await tester.tap(find.text('Solicitar'));
    await tester.pumpAndSettle();

    expect(find.text('Pagamento'), findsOneWidget);
    expect(find.text('Preço final'), findsOneWidget);
    expect(find.text('R\$ 45,00'), findsOneWidget);
    expect(find.text('Pix'), findsOneWidget);
    expect(find.text('Cartão'), findsOneWidget);
    expect(find.text('Carteira Ramo Nessa'), findsOneWidget);
    expect(find.text('Saldo: R\$ 100,00'), findsOneWidget);
    expect(find.textContaining('Procurando buggy'), findsNothing);

    await tester.tap(find.text('Carteira Ramo Nessa'));
    await tester.pumpAndSettle();

    expect(find.text('Pagamento confirmado'), findsOneWidget);
    expect(find.text('Saldo restante: R\$ 55,00'), findsOneWidget);
  });

  testWidgets(
    'sem motorista o valor volta para a carteira e a tela explica o estorno',
    (tester) async {
      final ride = PreparedRide(
        id: 'ride-refunded',
        state: 'AWAITING_PAYMENT',
        baseAmountCents: 4500,
        pickupCompensationCents: 0,
        totalAmountCents: 4500,
        holdExpiresAt: DateTime.now().add(const Duration(minutes: 2)),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: RidePaymentScreen(
            ride: ride,
            paymentService: _FakeRefundedPassengerPaymentService(),
            networkTilesEnabled: false,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));

      expect(find.text('Saldo: R\$ 100,00'), findsOneWidget);
      await tester.tap(find.text('Carteira Ramo Nessa'));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(ListView),
        const Offset(0, -320),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('O valor voltou integralmente'),
        findsOneWidget,
      );
      expect(find.text('Saldo: R\$ 100,00'), findsOneWidget);
      expect(find.text('Pagamento confirmado'), findsNothing);
    },
  );

  testWidgets('passageiro consegue trocar a origem manualmente', (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: _FakeRouteService(),
        placeSearchService: search,
        pricingQuoteService: _FakePricingQuoteService(),
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Minha localização'));
    await tester.pumpAndSettle();

    expect(find.text('Escolher origem'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Preá');
    await tester.pump();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ListTile, 'Preá'));
    await tester.pumpAndSettle();

    expect(find.text('Preá'), findsOneWidget);
  });
  testWidgets('após pagamento mostra motorista no acompanhamento da corrida',
      (tester) async {
    final search = _FakePlaceSearchService();

    await tester.pumpWidget(
      RamoNessaPassengerApp(
        locationService: _FakeLocationService(),
        routeService: _FakeRouteService(),
        placeSearchService: search,
        pricingQuoteService: _FakePricingQuoteService(),
        ridePreparationService: _FakeRidePreparationService(),
        paymentService: _FakePassengerPaymentService(),
        rideTrackingService: _FakeRideTrackingService(),
        networkTilesEnabled: false,
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('Pra onde vamos?'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Jericoacoara');
    await tester.pump();
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Jericoacoara'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).last, const Offset(0, -260));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solicitar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Carteira Ramo Nessa'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Sua corrida'), findsOneWidget);
    expect(find.text('Seu motorista está a caminho'), findsOneWidget);
    expect(find.byIcon(Icons.directions_car_filled_rounded), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

}

class _FakeLocationService implements LocationService {
  @override
  Future<LatLng> getCurrentLocation() async {
    return const LatLng(-2.7956, -40.5142);
  }
}

class _FakeRouteService implements RouteService {
  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    return RouteInfo(
      points: [origin, destination],
      distanceMeters: 2500,
      duration: const Duration(minutes: 7),
    );
  }
}

class _FakePricingQuoteService implements PricingQuoteService {
  @override
  Future<PricingQuote> quote({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
  }) async {
    final amount = service == ServiceType.buggy
        ? 4000 + passengers * 200
        : 4200;
    return PricingQuote.fromJson({
      'kind': 'exact',
      'ruleId': 'test-exact',
      'totalAmountCents': amount,
      'platformCommissionCents': (amount * 0.10).round(),
      'driverNetCents': (amount * 0.90).round(),
    });
  }
}

class _FakePlaceSearchService implements PlaceSearchService {
  int calls = 0;

  @override
  Future<List<RamoPlace>> search(String query) async {
    calls++;

    if (query.toLowerCase().contains('pre')) {
      return const [
        RamoPlace(
          name: 'Preá',
          address: 'Preá, Cruz, Ceará, Brasil',
          position: LatLng(-2.82017, -40.41467),
        ),
      ];
    }

    return const [
      RamoPlace(
        name: 'Jericoacoara',
        address: 'Jericoacoara, Ceará, Brasil',
        position: LatLng(-2.7956, -40.5142),
      ),
    ];
  }
}


class _FakeRidePreparationService implements RidePreparationService {
  @override
  Future<PreparedRide> prepare({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
  }) async {
    return PreparedRide(
      id: 'ride-test',
      state: 'AWAITING_PAYMENT',
      baseAmountCents: 4400,
      pickupCompensationCents: 100,
      totalAmountCents: 4500,
      holdExpiresAt: DateTime.now().add(const Duration(minutes: 2)),
    );
  }
}


class _FakePassengerPaymentService implements PassengerPaymentService {
  @override
  Future<int> walletBalanceCents() async => 10000;

  @override
  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  }) async {
    return const WalletRidePaymentResult(
      rideState: 'SEARCHING_DRIVER',
      walletBalanceCents: 5500,
      duplicatePayment: false,
      paymentConfirmed: true,
      dispatchStatus: 'SEARCHING_DRIVER',
    );
  }
}


class _FakeRideTrackingService implements PassengerRideTrackingService {
  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    return PassengerRideTrackingSnapshot(
      rideId: rideId,
      state: 'DRIVER_ARRIVING',
      category: 'buggy',
      pickupLatitude: -2.7956,
      pickupLongitude: -40.5142,
      dropoffLatitude: -2.82017,
      dropoffLongitude: -40.41467,
      driverLocation: PassengerDriverLocation(
        latitude: -2.8001,
        longitude: -40.5001,
        updatedAt: DateTime.now(),
        stale: false,
      ),
    );
  }
}


class _FakeRefundedPassengerPaymentService
    implements PassengerPaymentService {
  @override
  Future<int> walletBalanceCents() async => 10000;

  @override
  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  }) async {
    return const WalletRidePaymentResult(
      rideState: 'REFUNDED',
      walletBalanceCents: 10000,
      duplicatePayment: false,
      paymentConfirmed: false,
      paymentRefunded: true,
      dispatchStatus: 'NO_DRIVER_FOUND',
    );
  }
}
