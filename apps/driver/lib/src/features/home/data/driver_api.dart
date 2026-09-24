import '../../../core/location/driver_location_service.dart';
import '../domain/driver_models.dart';

abstract interface class DriverApi {
  Future<DriverSupplySnapshot> getSupply();

  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  });

  Future<DriverOffer?> currentOffer();

  Future<NearbyDriversSnapshot> nearbyDrivers();

  Future<DriverProfileSnapshot> profile();

  Future<DriverDocumentsSnapshot> documents();

  Future<DriverSecuritySnapshot> security();

  Future<DriverSessionRevokeResult> revokeOtherSessions();

  Future<String> updateProfilePhoto({
    required String mimeType,
    required List<int> bytes,
  });

  Future<DriverActivitySnapshot> activity();

  Future<AcceptedDriverRide?> currentRide();

  Future<AcceptedDriverRide> acceptOffer(String offerId);

  Future<String> rejectOffer(String offerId);

  Future<AcceptedDriverRide> markArrived(String rideId);

  Future<AcceptedDriverRide> startRide(String rideId);

  Future<DriverRideCompletion> completeRide(String rideId);

  Future<DriverFinanceSummary> financeSummary();

  Future<DriverFinanceStatement> financeStatement();

  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  });
}

class DriverApiException implements Exception {
  const DriverApiException(
    this.message, {
    this.code,
    this.statusCode,
  });

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}
