import '../core/location/driver_location_service.dart';
import '../core/navigation/driver_navigation_service.dart';
import '../features/home/data/driver_api.dart';
import '../features/home/domain/driver_models.dart';

/// Dados interativos usados apenas em RAMO_PREVIEW_MODE=true.
final class DriverPreviewDependencies {
  DriverPreviewDependencies();

  final DriverApi api = _PreviewDriverApi();
  final DriverLocationService location =
      const _PreviewDriverLocationService();
  final DriverNavigationService navigation =
      const _PreviewDriverNavigationService();
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
  Future<DriverFinanceSummary> financeSummary() async => _finance;

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
