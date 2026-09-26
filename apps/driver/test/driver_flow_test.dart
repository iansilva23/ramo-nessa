import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/navigation/driver_navigation_service.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_route_service.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_route_info.dart';

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

    expect(find.text('Você está offline'), findsOneWidget);

    await tester.tap(find.byKey(const Key('driver-go-online')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));

    expect(find.text('NOVA CORRIDA'), findsOneWidget);
    expect(find.text('R\$ 110,00'), findsAtLeastNWidgets(1));
    expect(find.text('Preá'), findsOneWidget);
    expect(find.text('Jijoca'), findsOneWidget);
    expect(find.text('EMBARQUE'), findsOneWidget);
    expect(find.text('DESTINO'), findsOneWidget);

    await tester.ensureVisible(find.text('Aceitar corrida'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Aceitar corrida'));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('ride-mini-ride-1-DRIVER_ARRIVING')),
      findsOneWidget,
    );
    expect(find.byTooltip('Abrir no Google Maps'), findsOneWidget);
    expect(find.textContaining('-2.82017'), findsNothing);
    expect(find.textContaining('-40.41467'), findsNothing);
    expect(api.acceptedOfferId, 'offer-1');
    expect(navigation.lastLatitude, isNull);
    expect(navigation.lastLongitude, isNull);

    await tester.tap(
      find.byKey(const ValueKey('ride-mini-ride-1-DRIVER_ARRIVING')),
    );
    await tester.pumpAndSettle();
    expect(find.text('A caminho do embarque'), findsOneWidget);
    expect(find.text('Cheguei'), findsOneWidget);
    expect(find.text('Parar navegação'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Abrir no Google Maps'));
    await tester.tap(find.byTooltip('Abrir no Google Maps'));
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
    expect(find.text('Parar navegação'), findsOneWidget);
    expect(find.text('Abrir no Google Maps'), findsOneWidget);

    await tester.ensureVisible(find.text('Abrir no Google Maps'));
    await tester.pump();
    await tester.tap(find.text('Abrir no Google Maps'));
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

  testWidgets(
    'cadastro aprovado sem supply inicializa offline usando GPS real',
    (tester) async {
      final api = _FakeDriverApi(missingSupplyOnFirstLoad: true);

      await tester.pumpWidget(
        RamoNessaDriverApp(
          api: api,
          locationService: const _FakeLocationService(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      expect(api.getSupplyCalls, 1);
      expect(api.lastSyncedPosition?.latitude, -2.82017);
      expect(api.lastSyncedPosition?.longitude, -40.41467);
      expect(find.text('Você está offline'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

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
    expect(find.text('NOVA CORRIDA'), findsNothing);

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

    await tester.tap(find.text('Ganhos'));
    await tester.pumpAndSettle();

    expect(find.text('Ganhos'), findsWidgets);
    expect(find.text('R\$ 110,00'), findsWidgets);
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
    'taxa cash fica restrita ao extrato da carteira',
    (tester) async {
      final api = _FakeDriverApi(cashCommissionDebtCents: 1200);

      await tester.pumpWidget(
        RamoNessaDriverApp(
          api: api,
          locationService: const _FakeLocationService(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 10));

      await tester.tap(find.text('Ganhos'));
      await tester.pumpAndSettle();

      expect(find.text('Taxa de uso do app pendente'), findsNothing);

      final statementButton =
          find.widgetWithText(TextButton, 'Ver extrato');
      await tester.ensureVisible(statementButton);
      await tester.pumpAndSettle();
      await tester.tap(statementButton);
      await tester.pumpAndSettle();

      expect(find.text('Extrato de ganhos'), findsOneWidget);
      expect(
        find.text('Taxa de uso do app pendente: R\$ 12,00'),
        findsOneWidget,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

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

      await tester.tap(find.text('Ganhos'));
      await tester.pumpAndSettle();

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

  testWidgets(
    'mesma oferta reutiliza rotas sem repetir chamadas do provedor',
    (tester) async {
      final api = _FakeDriverApi(
        initialOnline: true,
        offerCoordinates: true,
      );
      final routes = _CountingRouteService();

      await tester.pumpWidget(
        RamoNessaDriverApp(
          api: api,
          locationService: const _FakeLocationService(),
          routeService: routes,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));

      expect(routes.calls, 2);

      await tester.pump(const Duration(seconds: 11));
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump(const Duration(seconds: 11));
      await tester.pump(const Duration(milliseconds: 20));

      expect(routes.calls, 2);

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

    expect(find.text('NOVA CORRIDA'), findsOneWidget);

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

class _CountingRouteService implements DriverRouteService {
  int calls = 0;

  @override
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    calls++;
    return DriverRouteInfo(
      points: [origin, destination],
      distanceMeters: 1500,
      duration: const Duration(minutes: 4),
    );
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
    this.missingSupplyOnFirstLoad = false,
    this.cashCommissionDebtCents = 0,
    this.offerCoordinates = false,
  })  : _finance = DriverFinanceSummary(
          availableBalanceCents: 11000,
          payoutPendingCents: 0,
          cashCommissionDebtCents: cashCommissionDebtCents,
        ),
        _supply = DriverSupplySnapshot(
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
  final bool missingSupplyOnFirstLoad;
  final int cashCommissionDebtCents;
  final bool offerCoordinates;
  DriverSupplySnapshot _supply;
  int getSupplyCalls = 0;
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
  DriverFinanceSummary _finance;

  DriverOffer get _offer => DriverOffer(
        id: 'offer-1',
        rideId: 'ride-1',
        expiresAt: DateTime.now().add(const Duration(minutes: 2)),
        approximatePickupDistanceKm: 1.1,
        pickupLatitude: offerCoordinates ? -2.82017 : null,
        pickupLongitude: offerCoordinates ? -40.41467 : null,
        dropoffLatitude: offerCoordinates ? -2.7956 : null,
        dropoffLongitude: offerCoordinates ? -40.5142 : null,
        category: 'car',
        passengers: 2,
        origin: const DriverLocationRef(zoneId: 'prea'),
        destination: const DriverLocationRef(zoneId: 'jijoca'),
        driverEarningsCents: 11000,
        pickupCompensationCents: 200,
      );

  @override
  Future<DriverSupplySnapshot> getSupply() async {
    getSupplyCalls++;
    if (missingSupplyOnFirstLoad && getSupplyCalls == 1) {
      throw const DriverApiException(
        'Cadastro aprovado. Ative a localização para concluir a configuração operacional.',
        code: 'DRIVER_SUPPLY_NOT_INITIALIZED',
        statusCode: 409,
      );
    }
    return _supply;
  }

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
  Future<NearbyDriversSnapshot> nearbyDrivers() async {
    return const NearbyDriversSnapshot(
      enabled: false,
      refreshAfterSeconds: 30,
      drivers: [],
    );
  }

  @override
  Future<DriverProfileSnapshot> profile() async {
    return const DriverProfileSnapshot(
      driverId: 'driver-test',
      phoneE164: '+5588999999999',
      fullName: 'Motorista Teste',
      preferredName: 'Teste',
      profileStatus: 'approved',
      vehicleId: 'SW4 TESTE',
      vehiclePlate: 'TES1T23',
      vehicleMake: 'Toyota',
      vehicleModel: 'SW4',
      vehicleYear: 2026,
      vehicleColor: 'Preto',
      vehicleStatus: 'approved',
      vehicleCategories: ['car'],
      vehicleFourByFour: true,
      vehicleSeatCapacity: 6,
    );
  }

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
  Future<DriverActivitySnapshot> activity() async {
    return const DriverActivitySnapshot(
      total: 3,
      completed: 2,
      cancelled: 1,
      inProgress: 0,
      earningsCents: 22000,
      rides: [],
    );
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
  Future<List<DriverRideChatMessage>> rideMessages(String rideId) async =>
      const [];

  @override
  Future<DriverRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    return DriverRideChatMessage(
      id: 'test-chat',
      rideId: rideId,
      senderType: 'driver',
      senderId: 'driver-test',
      body: body,
      createdAt: DateTime(2026, 9, 26),
    );
  }

  @override
  Future<DriverPayoutDestination> payoutDestination() async =>
      const DriverPayoutDestination(
        configured: true,
        pixKeyType: 'cpf',
        pixKeyMasked: '••••0000',
      );

  @override
  Future<DriverPayoutDestination> savePayoutDestination({
    required String pixKeyType,
    required String pixKey,
  }) async =>
      DriverPayoutDestination(
        configured: true,
        pixKeyType: pixKeyType,
        pixKeyMasked: '••••0000',
        updatedAt: DateTime(2026, 9, 26),
      );

  @override
  Future<DriverFinanceSummary> financeSummary() async => _finance;

  @override
  Future<DriverFinanceStatement> financeStatement() async =>
      DriverFinanceStatement(
        generatedAt: DateTime(2026, 9, 24),
        finance: _finance,
        items: const [],
      );

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
      cashCommissionDebtCents:
          _finance.cashCommissionDebtCents,
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
