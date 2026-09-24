import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_realtime_service.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';

void main() {
  testWidgets('oferta realtime aparece sem esperar polling', (tester) async {
    final realtime = _FakeRealtimeService();

    await tester.pumpWidget(
      RamoNessaDriverApp(
        api: _NoOfferDriverApi(),
        locationService: const _NoopLocationService(),
        realtimeService: realtime,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Procurando corridas por perto'), findsOneWidget);

    realtime.add(
      DriverRealtimeUpdate(
        offer: DriverOffer(
          id: 'offer-live',
          rideId: 'ride-live',
          expiresAt: DateTime.now().add(const Duration(minutes: 1)),
          approximatePickupDistanceKm: 1.4,
          category: 'car',
          passengers: 2,
          origin: const DriverLocationRef(zoneId: 'prea'),
          destination: const DriverLocationRef(zoneId: 'jijoca'),
          driverEarningsCents: 10800,
          pickupCompensationCents: 0,
        ),
        offerUpdated: true,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('Nova corrida'), findsOneWidget);
    expect(find.text('R\$ 108,00'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await realtime.close();
  });
}

class _FakeRealtimeService implements DriverRealtimeService {
  final _controller = StreamController<DriverRealtimeUpdate>.broadcast();

  void add(DriverRealtimeUpdate update) => _controller.add(update);

  Future<void> close() => _controller.close();

  @override
  Stream<DriverRealtimeUpdate> watch() => _controller.stream;
}

class _NoopLocationService implements DriverLocationService {
  const _NoopLocationService();

  @override
  Future<DriverPosition> currentPosition() async =>
      const DriverPosition(latitude: -2.82, longitude: -40.41);

  @override
  Stream<DriverPosition> positionStream() => const Stream.empty();
}

class _NoOfferDriverApi implements DriverApi {
  final _supply = DriverSupplySnapshot(
    driverId: 'driver-live',
    vehicleId: 'vehicle-live',
    categories: const ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.82,
    longitude: -40.41,
    locationUpdatedAt: DateTime(2026, 9, 23),
  );

  @override
  Future<DriverSupplySnapshot> getSupply() async => _supply;

  @override
  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  }) async => _supply;

  @override
  Future<DriverOffer?> currentOffer() async => null;

  @override
  Future<NearbyDriversSnapshot> nearbyDrivers() async =>
      const NearbyDriversSnapshot(
        enabled: false,
        refreshAfterSeconds: 30,
        drivers: [],
      );

  @override
  Future<DriverProfileSnapshot> profile() async =>
      const DriverProfileSnapshot(driverId: 'driver-live');

  @override
  Future<DriverDocumentsSnapshot> documents() async =>
      const DriverDocumentsSnapshot(
        items: [],
        requiredDocumentTypes: [
          'driver_license',
          'vehicle_registration',
        ],
        documentsApproved: false,
      );

  @override
  Future<DriverDocumentItem> uploadDocument({
    required String documentType,
    required String mimeType,
    required List<int> bytes,
    String? expiresOn,
  }) async {
    final now = DateTime(2026, 9, 24, 20);
    return DriverDocumentItem(
      id: 'document-$documentType',
      documentType: documentType,
      status: 'pending',
      effectiveStatus: 'pending',
      mimeType: mimeType,
      sizeBytes: bytes.length,
      expiresOn: expiresOn,
      submittedAt: now,
      updatedAt: now,
    );
  }

  @override
  Future<DriverSecuritySnapshot> security() async =>
      DriverSecuritySnapshot(
        sessionId: 'session-test',
        subjectType: 'driver',
        createdAt: DateTime(2026, 9, 24, 10),
        expiresAt: DateTime(2026, 10, 24, 10),
      );

  @override
  Future<DriverSessionRevokeResult> revokeOtherSessions() async =>
      const DriverSessionRevokeResult(
        revokedSessions: 0,
        disabledDevices: 0,
      );

  @override
  Future<DriverSupportSnapshot> supportTickets() async =>
      const DriverSupportSnapshot(tickets: []);

  @override
  Future<DriverSupportTicket> createSupportTicket({
    required String category,
    required String subject,
    required String message,
  }) async =>
      DriverSupportTicket(
        id: 'support-test',
        category: category,
        subject: subject,
        message: message,
        status: 'open',
        createdAt: DateTime(2026, 9, 24, 12),
        updatedAt: DateTime(2026, 9, 24, 12),
      );

  @override
  Future<String> updateProfilePhoto({
    required String mimeType,
    required List<int> bytes,
  }) async {
    return '/v1/drivers/test-driver/photo?v=test';
  }

  @override
  Future<DriverActivitySnapshot> activity() async =>
      const DriverActivitySnapshot(
        total: 0,
        completed: 0,
        cancelled: 0,
        inProgress: 0,
        earningsCents: 0,
        rides: [],
      );

  @override
  Future<AcceptedDriverRide?> currentRide() async => null;

  @override
  Future<AcceptedDriverRide> acceptOffer(String offerId) =>
      throw UnimplementedError();

  @override
  Future<String> rejectOffer(String offerId) =>
      throw UnimplementedError();

  @override
  Future<AcceptedDriverRide> markArrived(String rideId) =>
      throw UnimplementedError();

  @override
  Future<AcceptedDriverRide> startRide(String rideId) =>
      throw UnimplementedError();

  @override
  Future<DriverRideCompletion> completeRide(String rideId) =>
      throw UnimplementedError();

  @override
  Future<DriverFinanceSummary> financeSummary() async =>
      const DriverFinanceSummary(
        availableBalanceCents: 0,
        payoutPendingCents: 0,
      );

  @override
  Future<DriverFinanceStatement> financeStatement() async =>
      DriverFinanceStatement(
        generatedAt: DateTime(2026, 9, 24),
        finance: const DriverFinanceSummary(
          availableBalanceCents: 0,
          payoutPendingCents: 0,
        ),
        items: const [],
      );

  @override
  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();
}
