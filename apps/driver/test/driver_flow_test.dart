import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/navigation/driver_navigation_service.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';

void main() {
  testWidgets('motorista fica online, recebe oferta e aceita', (tester) async {
    final api = _FakeDriverApi();
    final navigation = _FakeNavigationService();

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: api,
        locationService: const _FakeLocationService(),
        navigationService: navigation,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Offline'), findsOneWidget);
    expect(find.text('Você está offline'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Nova corrida'), findsOneWidget);
    expect(find.text('R\$ 110,00'), findsOneWidget);
    expect(find.text('Preá → Jijoca'), findsOneWidget);

    await tester.ensureVisible(find.text('Aceitar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Aceitar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('A caminho do embarque'), findsOneWidget);
    expect(find.text('Cheguei'), findsOneWidget);
    expect(find.text('Navegar até o embarque'), findsOneWidget);
    expect(api.acceptedOfferId, 'offer-1');

    await tester.ensureVisible(find.text('Navegar até o embarque'));
    await tester.pump();
    await tester.tap(find.text('Navegar até o embarque'));
    await tester.pump();
    expect(navigation.lastLatitude, -2.82017);
    expect(navigation.lastLongitude, -40.41467);

    await tester.ensureVisible(find.text('Cheguei'));
    await tester.pump();
    await tester.tap(find.text('Cheguei'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    expect(find.text('Iniciar corrida'), findsOneWidget);

    await tester.ensureVisible(find.text('Iniciar corrida'));
    await tester.pump();
    await tester.tap(find.text('Iniciar corrida'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    expect(find.text('Finalizar corrida'), findsOneWidget);
    expect(find.text('Navegar até o destino'), findsOneWidget);

    await tester.ensureVisible(find.text('Navegar até o destino'));
    await tester.pump();
    await tester.tap(find.text('Navegar até o destino'));
    await tester.pump();
    expect(navigation.lastLatitude, -2.7956);
    expect(navigation.lastLongitude, -40.5142);

    await tester.ensureVisible(find.text('Finalizar corrida'));
    await tester.pump();
    await tester.tap(find.text('Finalizar corrida'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.textContaining('Saldo disponível: R\$ 110,00'), findsOneWidget);
    expect(api.completedRideId, 'ride-1');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('corrida ativa é recuperada ao reabrir o app', (tester) async {
    final api = _FakeDriverApi(
      initialOnline: true,
      initialBusy: true,
    );

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: api,
        locationService: const _FakeLocationService(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(api.currentRideCalls, 1);
    expect(find.text('A caminho do embarque'), findsOneWidget);
    expect(find.text('Cheguei'), findsOneWidget);
    expect(find.text('Nova corrida'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets(
    'motorista online sincroniza atualizações contínuas de localização',
    (tester) async {
      final api = _FakeDriverApi(initialOnline: true);
      final location = _StreamingFakeLocationService();

      await tester.pumpWidget(
        RamoNessaDriverApp(
          api: api,
          locationService: location,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      location.add(
        const DriverPosition(
          latitude: -2.90001,
          longitude: -40.50001,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      expect(api.lastSyncedPosition?.latitude, -2.90001);
      expect(api.lastSyncedPosition?.longitude, -40.50001);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

  testWidgets('motorista vê saldo e reserva saque', (tester) async {
    final api = _FakeDriverApi();

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: api,
        locationService: const _FakeLocationService(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Ganhos'), findsOneWidget);
    expect(find.text('R\$ 110,00'), findsOneWidget);
    expect(find.text('Em processamento: R\$ 0,00'), findsOneWidget);

    await tester.ensureVisible(find.text('Solicitar saque'));
    await tester.pump();
    await tester.tap(find.text('Solicitar saque'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(api.lastPayoutAmountCents, 11000);
    expect(find.text('Em processamento: R\$ 110,00'), findsOneWidget);
    expect(
      find.textContaining('Saque solicitado: R\$ 110,00'),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets(
    'retry de saque após falha de transporte reutiliza a mesma chave',
    (tester) async {
      final api = _FakeDriverApi(failFirstPayoutUnexpectedly: true);

      await tester.pumpWidget(
        RamoNessaDriverApp(
          api: api,
          locationService: const _FakeLocationService(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      await tester.ensureVisible(find.text('Solicitar saque'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Solicitar saque'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      // A primeira tentativa chegou à API e falhou como transporte.
      // O comportamento crítico é o retry reutilizar a mesma chave.
      expect(api.payoutAttempts, 1);
      expect(api.payoutIdempotencyKeys, hasLength(1));

      await tester.ensureVisible(find.text('Solicitar saque'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Solicitar saque'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      expect(api.payoutIdempotencyKeys, hasLength(2));
      expect(
        api.payoutIdempotencyKeys[1],
        api.payoutIdempotencyKeys[0],
      );
      expect(find.text('Em processamento: R\$ 110,00'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

  testWidgets('motorista pode recusar oferta', (tester) async {
    final api = _FakeDriverApi(initialOnline: true);

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: api,
        locationService: const _FakeLocationService(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Nova corrida'), findsOneWidget);

    await tester.ensureVisible(find.text('Recusar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recusar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(api.rejectedOfferId, 'offer-1');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}

class _FakeNavigationService implements DriverNavigationService {
  double? lastLatitude;
  double? lastLongitude;

  @override
  Future<void> openNavigation({
    required double latitude,
    required double longitude,
  }) async {
    lastLatitude = latitude;
    lastLongitude = longitude;
  }
}

class _FakeLocationService implements DriverLocationService {
  const _FakeLocationService();

  @override
  Future<DriverPosition> currentPosition() async {
    return const DriverPosition(
      latitude: -2.82017,
      longitude: -40.41467,
    );
  }

  @override
  Stream<DriverPosition> positionStream() => const Stream.empty();
}

class _StreamingFakeLocationService implements DriverLocationService {
  final _controller = StreamController<DriverPosition>();

  void add(DriverPosition position) => _controller.add(position);

  @override
  Future<DriverPosition> currentPosition() async {
    return const DriverPosition(
      latitude: -2.82017,
      longitude: -40.41467,
    );
  }

  @override
  Stream<DriverPosition> positionStream() => _controller.stream;
}

class _FakeDriverApi implements DriverApi {
  _FakeDriverApi({
    bool initialOnline = false,
    bool initialBusy = false,
    this.failFirstPayoutUnexpectedly = false,
  })  : _supply = DriverSupplySnapshot(
          driverId: 'driver-test',
          vehicleId: 'SW4 TESTE',
          categories: const ['car'],
          fourByFour: true,
          seatCapacity: 6,
          online: initialOnline,
          busy: initialBusy,
          latitude: -2.82,
          longitude: -40.41,
          locationUpdatedAt: DateTime(2026, 9, 23, 17),
        ),
        _currentRide = initialBusy
            ? const AcceptedDriverRide(
                id: 'ride-restored',
                state: 'DRIVER_ARRIVING',
                category: 'car',
                passengers: 2,
                origin: DriverLocationRef(zoneId: 'prea'),
                destination: DriverLocationRef(zoneId: 'jijoca'),
                driverEarningsCents: 11000,
                pickupCompensationCents: 200,
                pickupLatitude: -2.82017,
                pickupLongitude: -40.41467,
                dropoffLatitude: -2.7956,
                dropoffLongitude: -40.5142,
              )
            : null;

  final bool failFirstPayoutUnexpectedly;
  DriverSupplySnapshot _supply;
  bool _offerAvailable = true;
  String? acceptedOfferId;
  String? rejectedOfferId;
  String? completedRideId;
  DriverPosition? lastSyncedPosition;
  AcceptedDriverRide? _currentRide;
  int currentRideCalls = 0;
  int? lastPayoutAmountCents;
  int payoutAttempts = 0;
  final List<String> payoutIdempotencyKeys = [];
  DriverFinanceSummary _finance = const DriverFinanceSummary(
    availableBalanceCents: 11000,
    payoutPendingCents: 0,
  );

  DriverOffer get _offer => DriverOffer(
        id: 'offer-1',
        rideId: 'ride-1',
        expiresAt: DateTime.now().add(const Duration(minutes: 2)),
        approximatePickupDistanceKm: 1.1,
        category: 'car',
        passengers: 2,
        origin: const DriverLocationRef(zoneId: 'prea'),
        destination: const DriverLocationRef(zoneId: 'jijoca'),
        driverEarningsCents: 11000,
        pickupCompensationCents: 200,
      );

  @override
  Future<DriverSupplySnapshot> getSupply() async => _supply;

  @override
  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  }) async {
    if (position != null) {
      lastSyncedPosition = position;
    }
    _supply = DriverSupplySnapshot(
      driverId: _supply.driverId,
      vehicleId: _supply.vehicleId,
      categories: _supply.categories,
      fourByFour: _supply.fourByFour,
      seatCapacity: _supply.seatCapacity,
      online: online ?? _supply.online,
      busy: _supply.busy,
      latitude: position?.latitude ?? _supply.latitude,
      longitude: position?.longitude ?? _supply.longitude,
      locationUpdatedAt: DateTime.now(),
    );
    return _supply;
  }

  @override
  Future<DriverOffer?> currentOffer() async {
    if (!_supply.online || !_offerAvailable) return null;
    return _offer;
  }

  @override
  Future<AcceptedDriverRide> acceptOffer(String offerId) async {
    acceptedOfferId = offerId;
    _offerAvailable = false;
    _supply = DriverSupplySnapshot(
      driverId: _supply.driverId,
      vehicleId: _supply.vehicleId,
      categories: _supply.categories,
      fourByFour: _supply.fourByFour,
      seatCapacity: _supply.seatCapacity,
      online: true,
      busy: true,
      latitude: _supply.latitude,
      longitude: _supply.longitude,
      locationUpdatedAt: _supply.locationUpdatedAt,
    );

    _currentRide = const AcceptedDriverRide(
      id: 'ride-1',
      state: 'DRIVER_ARRIVING',
      category: 'car',
      passengers: 2,
      origin: DriverLocationRef(zoneId: 'prea'),
      destination: DriverLocationRef(zoneId: 'jijoca'),
      driverEarningsCents: 11000,
      pickupCompensationCents: 200,
      pickupLatitude: -2.82017,
      pickupLongitude: -40.41467,
      dropoffLatitude: -2.7956,
      dropoffLongitude: -40.5142,
    );
    return _currentRide!;
  }

  @override
  Future<AcceptedDriverRide?> currentRide() async {
    currentRideCalls++;
    return _currentRide;
  }

  @override
  Future<AcceptedDriverRide> markArrived(String rideId) async {
    final ride = _currentRide!;
    _currentRide = AcceptedDriverRide(
      id: ride.id,
      state: 'DRIVER_ARRIVED',
      category: ride.category,
      passengers: ride.passengers,
      origin: ride.origin,
      destination: ride.destination,
      driverEarningsCents: ride.driverEarningsCents,
      pickupCompensationCents: ride.pickupCompensationCents,
      pickupLatitude: ride.pickupLatitude,
      pickupLongitude: ride.pickupLongitude,
      dropoffLatitude: ride.dropoffLatitude,
      dropoffLongitude: ride.dropoffLongitude,
    );
    return _currentRide!;
  }

  @override
  Future<AcceptedDriverRide> startRide(String rideId) async {
    final ride = _currentRide!;
    _currentRide = AcceptedDriverRide(
      id: ride.id,
      state: 'IN_PROGRESS',
      category: ride.category,
      passengers: ride.passengers,
      origin: ride.origin,
      destination: ride.destination,
      driverEarningsCents: ride.driverEarningsCents,
      pickupCompensationCents: ride.pickupCompensationCents,
      pickupLatitude: ride.pickupLatitude,
      pickupLongitude: ride.pickupLongitude,
      dropoffLatitude: ride.dropoffLatitude,
      dropoffLongitude: ride.dropoffLongitude,
    );
    return _currentRide!;
  }

  @override
  Future<DriverRideCompletion> completeRide(String rideId) async {
    completedRideId = rideId;
    final ride = _currentRide!;
    final completed = AcceptedDriverRide(
      id: ride.id,
      state: 'COMPLETED',
      category: ride.category,
      passengers: ride.passengers,
      origin: ride.origin,
      destination: ride.destination,
      driverEarningsCents: ride.driverEarningsCents,
      pickupCompensationCents: ride.pickupCompensationCents,
      pickupLatitude: ride.pickupLatitude,
      pickupLongitude: ride.pickupLongitude,
      dropoffLatitude: ride.dropoffLatitude,
      dropoffLongitude: ride.dropoffLongitude,
    );
    _currentRide = null;
    _supply = DriverSupplySnapshot(
      driverId: _supply.driverId,
      vehicleId: _supply.vehicleId,
      categories: _supply.categories,
      fourByFour: _supply.fourByFour,
      seatCapacity: _supply.seatCapacity,
      online: true,
      busy: false,
      latitude: _supply.latitude,
      longitude: _supply.longitude,
      locationUpdatedAt: _supply.locationUpdatedAt,
    );
    return DriverRideCompletion(
      ride: completed,
      driverBalanceCents: 11000,
      duplicateSettlement: false,
    );
  }

  @override
  Future<DriverFinanceSummary> financeSummary() async => _finance;

  @override
  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  }) async {
    lastPayoutAmountCents = amountCents;
    payoutAttempts++;
    payoutIdempotencyKeys.add(idempotencyKey);
    if (failFirstPayoutUnexpectedly && payoutAttempts == 1) {
      throw StateError('simulated transport failure');
    }

    _finance = DriverFinanceSummary(
      availableBalanceCents:
          _finance.availableBalanceCents - amountCents,
      payoutPendingCents:
          _finance.payoutPendingCents + amountCents,
    );
    return DriverPayoutReservation(
      id: 'payout-test',
      amountCents: amountCents,
      status: 'requested',
      finance: _finance,
      duplicateRequest: false,
    );
  }

  @override
  Future<String> rejectOffer(String offerId) async {
    rejectedOfferId = offerId;
    _offerAvailable = false;
    return 'SEARCHING_DRIVER';
  }
}
