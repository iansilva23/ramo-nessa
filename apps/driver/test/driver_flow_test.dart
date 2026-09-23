import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';

void main() {
  testWidgets('motorista fica online, recebe oferta e aceita', (tester) async {
    final api = _FakeDriverApi();

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: api,
        locationService: const _FakeLocationService(),
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

    await tester.tap(find.text('Aceitar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Corrida aceita'), findsOneWidget);
    expect(api.acceptedOfferId, 'offer-1');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

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

    await tester.tap(find.text('Recusar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(api.rejectedOfferId, 'offer-1');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
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
}

class _FakeDriverApi implements DriverApi {
  _FakeDriverApi({bool initialOnline = false})
      : _supply = DriverSupplySnapshot(
          driverId: 'driver-test',
          vehicleId: 'SW4 TESTE',
          categories: const ['car'],
          fourByFour: true,
          seatCapacity: 6,
          online: initialOnline,
          busy: false,
          latitude: -2.82,
          longitude: -40.41,
          locationUpdatedAt: DateTime(2026, 9, 23, 17),
        );

  DriverSupplySnapshot _supply;
  bool _offerAvailable = true;
  String? acceptedOfferId;
  String? rejectedOfferId;

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

    return AcceptedDriverRide(
      id: 'ride-1',
      state: 'DRIVER_ASSIGNED',
      category: 'car',
      passengers: 2,
      origin: const DriverLocationRef(zoneId: 'prea'),
      destination: const DriverLocationRef(zoneId: 'jijoca'),
      driverEarningsCents: 11000,
      pickupCompensationCents: 200,
      pickupLatitude: -2.82017,
      pickupLongitude: -40.41467,
    );
  }

  @override
  Future<String> rejectOffer(String offerId) async {
    rejectedOfferId = offerId;
    _offerAvailable = false;
    return 'SEARCHING_DRIVER';
  }
}
