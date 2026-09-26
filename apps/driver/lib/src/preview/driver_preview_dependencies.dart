import 'package:latlong2/latlong.dart';

import '../core/location/driver_location_service.dart';
import '../core/navigation/driver_navigation_service.dart';
import '../features/home/data/driver_api.dart';
import '../features/home/data/driver_route_service.dart';
import '../features/home/domain/driver_models.dart';
import '../features/home/domain/driver_route_info.dart';

/// Dados interativos usados apenas em RAMO_PREVIEW_MODE=true.
final class DriverPreviewDependencies {
  DriverPreviewDependencies();

  final DriverApi api = _PreviewDriverApi();
  final DriverLocationService location =
      const _PreviewDriverLocationService();
  final DriverNavigationService navigation =
      const _PreviewDriverNavigationService();
  final DriverRouteService route =
      const _PreviewDriverRouteService();
}

final class _PreviewDriverLocationService
    implements DriverLocationService {
  const _PreviewDriverLocationService();

  static const _position = DriverPosition(
    latitude: -2.7956,
    longitude: -40.5142,
  );

  @override
  Future<DriverPosition> currentPosition() async => _position;

  @override
  Stream<DriverPosition> positionStream() => Stream<DriverPosition>.periodic(
        const Duration(seconds: 15),
        (_) => _position,
      );
}

final class _PreviewDriverNavigationService
    implements DriverNavigationService {
  const _PreviewDriverNavigationService();

  @override
  Future<void> openNavigation({
    required double latitude,
    required double longitude,
  }) async {}
}

final class _PreviewDriverRouteService
    implements DriverRouteService {
  const _PreviewDriverRouteService();

  @override
  Future<DriverRouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final distanceMeters =
        const Distance().as(LengthUnit.Meter, origin, destination);
    final seconds = (distanceMeters / 8.33).round().clamp(60, 7200);

    return DriverRouteInfo(
      points: [origin, destination],
      distanceMeters: distanceMeters,
      duration: Duration(seconds: seconds),
    );
  }
}

final class _PreviewDriverApi implements DriverApi {
  _PreviewDriverApi()
      : _supply = DriverSupplySnapshot(
          driverId: 'preview-driver',
          vehicleId: 'preview-vehicle',
          categories: const ['comfort_black', 'buggy', 'car'],
          fourByFour: true,
          seatCapacity: 4,
          online: true,
          busy: false,
          latitude: -2.7956,
          longitude: -40.5142,
          locationUpdatedAt: DateTime.now(),
        ),
        _offer = DriverOffer(
          id: 'preview-offer',
          rideId: 'preview-ride',
          expiresAt: DateTime.now().add(const Duration(minutes: 10)),
          approximatePickupDistanceKm: 0.8,
          category: 'comfort_black',
          passengers: 2,
          origin: const DriverLocationRef(zoneId: 'jericoacoara'),
          destination: const DriverLocationRef(zoneId: 'prea'),
          driverEarningsCents: 7200,
          pickupCompensationCents: 800,
          paymentMethod: 'pix',
        );

  DriverSupplySnapshot _supply;
  DriverOffer? _offer;
  AcceptedDriverRide? _ride;
  final List<DriverRideChatMessage> _chatMessages = [];
  DriverPayoutDestination _payoutDestination =
      const DriverPayoutDestination(configured: false);
  DriverFinanceSummary _finance = const DriverFinanceSummary(
    availableBalanceCents: 18240,
    payoutPendingCents: 0,
    cashCommissionDebtCents: 0,
  );

  DriverSupplySnapshot _copySupply({
    bool? online,
    bool? busy,
    double? latitude,
    double? longitude,
  }) {
    return DriverSupplySnapshot(
      driverId: _supply.driverId,
      vehicleId: _supply.vehicleId,
      categories: _supply.categories,
      fourByFour: _supply.fourByFour,
      seatCapacity: _supply.seatCapacity,
      online: online ?? _supply.online,
      busy: busy ?? _supply.busy,
      latitude: latitude ?? _supply.latitude,
      longitude: longitude ?? _supply.longitude,
      locationUpdatedAt: DateTime.now(),
    );
  }

  AcceptedDriverRide _rideState(String state) {
    final current = _ride;
    return AcceptedDriverRide(
      id: current?.id ?? 'preview-ride',
      state: state,
      category: current?.category ?? 'comfort_black',
      passengers: current?.passengers ?? 2,
      origin:
          current?.origin ?? const DriverLocationRef(zoneId: 'jericoacoara'),
      destination:
          current?.destination ?? const DriverLocationRef(zoneId: 'prea'),
      driverEarningsCents: current?.driverEarningsCents ?? 7200,
      pickupCompensationCents: current?.pickupCompensationCents ?? 800,
      paymentMethod: current?.paymentMethod ?? 'pix',
      pickupLatitude: -2.7956,
      pickupLongitude: -40.5142,
      dropoffLatitude: -2.8118,
      dropoffLongitude: -40.5795,
    );
  }

  @override
  Future<DriverSupplySnapshot> getSupply() async => _supply;

  @override
  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  }) async {
    _supply = _copySupply(
      online: online,
      latitude: position?.latitude,
      longitude: position?.longitude,
    );
    return _supply;
  }

  @override
  Future<DriverOffer?> currentOffer() async {
    if (!_supply.online || _supply.busy) return null;
    return _offer;
  }

  @override
  Future<NearbyDriversSnapshot> nearbyDrivers() async {
    return const NearbyDriversSnapshot(
      enabled: true,
      refreshAfterSeconds: 20,
      drivers: [
        NearbyDriverPosition(
          latitude: -2.7982,
          longitude: -40.5180,
          busy: false,
          locationAgeSeconds: 8,
        ),
        NearbyDriverPosition(
          latitude: -2.7918,
          longitude: -40.5095,
          busy: true,
          locationAgeSeconds: 14,
        ),
      ],
    );
  }

  @override
  Future<DriverProfileSnapshot> profile() async {
    return const DriverProfileSnapshot(
      driverId: 'preview-driver',
      phoneE164: '+5588999999999',
      fullName: 'Motorista Preview',
      preferredName: 'Motorista',
      profileStatus: 'approved',
      vehicleId: 'preview-vehicle',
      vehiclePlate: 'PRE1A23',
      vehicleMake: 'Toyota',
      vehicleModel: 'SW4',
      vehicleYear: 2026,
      vehicleColor: 'Preto',
      vehicleStatus: 'approved',
      vehicleCategories: ['car', 'comfort_black', 'buggy'],
      vehicleFourByFour: true,
      vehicleSeatCapacity: 4,
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
        sessionId: 'preview-session',
        subjectType: 'driver',
        createdAt: DateTime(2026, 9, 24, 9),
        expiresAt: DateTime(2026, 10, 24, 9),
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
    return '/v1/drivers/preview-driver/photo?v=preview';
  }

  @override
  Future<DriverActivitySnapshot> activity({
    DateTime? from,
    DateTime? to,
  }) async {
    return DriverActivitySnapshot(
      total: _ride == null ? 12 : 13,
      completed: 11,
      cancelled: 1,
      inProgress: _ride == null ? 0 : 1,
      earningsCents: 82600,
      grossCents: 91800,
      platformFeeCents: 9200,
      averageEarningsCents: 7509,
      payoutsRequestedCents: 30000,
      payoutsPaidCents: 20000,
      availableBalanceCents: _finance.availableBalanceCents,
      rides: [
        DriverActivityRide(
          id: 'preview-history-1',
          state: 'COMPLETED',
          category: 'car',
          origin: const DriverLocationRef(zoneId: 'jericoacoara'),
          destination: const DriverLocationRef(zoneId: 'prea'),
          driverEarningsCents: 7200,
          totalAmountCents: 8000,
          platformFeeCents: 800,
          updatedAt: DateTime(2026, 9, 23, 18, 30),
          paymentMethod: 'pix',
        ),
      ],
    );
  }

  @override
  Future<AcceptedDriverRide?> currentRide() async => _ride;

  @override
  Future<AcceptedDriverRide> acceptOffer(String offerId) async {
    _ride = _rideState('DRIVER_ASSIGNED');
    _offer = null;
    _supply = _copySupply(busy: true);
    return _ride!;
  }

  @override
  Future<String> rejectOffer(String offerId) async {
    _offer = null;
    return 'rejected';
  }

  @override
  Future<AcceptedDriverRide> markArrived(String rideId) async {
    _ride = _rideState('DRIVER_ARRIVED');
    return _ride!;
  }

  @override
  Future<AcceptedDriverRide> startRide(String rideId) async {
    _ride = _rideState('IN_PROGRESS');
    return _ride!;
  }

  @override
  Future<DriverRideCompletion> completeRide(String rideId) async {
    final completed = _rideState('COMPLETED');
    _ride = null;
    _supply = _copySupply(busy: false);
    _finance = DriverFinanceSummary(
      availableBalanceCents:
          _finance.availableBalanceCents + completed.driverEarningsCents,
      payoutPendingCents: _finance.payoutPendingCents,
      cashCommissionDebtCents: _finance.cashCommissionDebtCents,
    );
    return DriverRideCompletion(
      ride: completed,
      driverBalanceCents: _finance.availableBalanceCents,
      duplicateSettlement: false,
    );
  }

  @override
  Future<List<DriverRideChatMessage>> rideMessages(String rideId) async =>
      List.unmodifiable(_chatMessages);

  @override
  Future<DriverRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    final message = DriverRideChatMessage(
      id: 'preview-chat-${_chatMessages.length + 1}',
      rideId: rideId,
      senderType: 'driver',
      senderId: 'preview-driver',
      body: body.trim(),
      createdAt: DateTime.now(),
    );
    _chatMessages.add(message);
    return message;
  }

  @override
  Future<DriverFinanceSummary> financeSummary() async => _finance;

  @override
  Future<DriverFinanceStatement> financeStatement() async {
    return DriverFinanceStatement(
      generatedAt: DateTime.now(),
      finance: _finance,
      items: const [],
    );
  }

  @override
  Future<DriverPayoutDestination> payoutDestination() async =>
      _payoutDestination;

  @override
  Future<DriverPayoutDestination> savePayoutDestination({
    required String pixKeyType,
    required String pixKey,
  }) async {
    final value = pixKey.trim();
    _payoutDestination = DriverPayoutDestination(
      configured: true,
      pixKeyType: pixKeyType,
      pixKeyMasked: value.length <= 4
          ? '••••'
          : '••••${value.substring(value.length - 4)}',
      updatedAt: DateTime.now(),
    );
    return _payoutDestination;
  }

  @override
  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  }) async {
    final amount = amountCents.clamp(0, _finance.availableBalanceCents).toInt();
    _finance = DriverFinanceSummary(
      availableBalanceCents:
          _finance.availableBalanceCents - amount,
      payoutPendingCents: _finance.payoutPendingCents + amount,
      cashCommissionDebtCents: _finance.cashCommissionDebtCents,
    );

    return DriverPayoutReservation(
      id: 'preview-payout',
      amountCents: amount,
      status: 'pending',
      finance: _finance,
      duplicateRequest: false,
    );
  }
}
