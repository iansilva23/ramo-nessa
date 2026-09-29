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

  Future<DriverDocumentItem> uploadDocument({
    required String documentType,
    required String mimeType,
    required List<int> bytes,
    String? expiresOn,
  });

  Future<DriverSecuritySnapshot> security();

  Future<DriverSessionRevokeResult> revokeOtherSessions();

  Future<DriverSupportSnapshot> supportTickets();

  Future<DriverSupportTicket> createSupportTicket({
    required String category,
    required String subject,
    required String message,
  });

  Future<String> updateProfilePhoto({
    required String mimeType,
    required List<int> bytes,
  });

  Future<DriverActivitySnapshot> activity({
    DateTime? from,
    DateTime? to,
  });

  Future<AcceptedDriverRide?> currentRide();

  Future<AcceptedDriverRide> acceptOffer(String offerId);

  Future<String> rejectOffer(String offerId);

  Future<AcceptedDriverRide> markArrived(String rideId);

  Future<AcceptedDriverRide> startRide(String rideId);

  Future<DriverRideCompletion> completeRide(String rideId);

  Future<List<DriverRideChatMessage>> rideMessages(String rideId);

  Future<DriverRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  });

  Future<DriverFinanceSummary> financeSummary();

  Future<DriverFinanceStatement> financeStatement();

  Future<DriverPayoutDestination> payoutDestination();

  Future<DriverPayoutDestination> savePayoutDestination({
    required String pixKeyType,
    required String pixKey,
  });

  Future<DriverPayoutReservation> requestPayout({
    required int amountCents,
    required String idempotencyKey,
  });
}

class DriverRideCancellationResult {
  const DriverRideCancellationResult({
    required this.refundStatus,
    required this.adminReviewCreated,
    required this.compensationReviewRequired,
    required this.duplicateCancellation,
  });

  factory DriverRideCancellationResult.fromJson(
    Map<String, dynamic> json,
  ) {
    return DriverRideCancellationResult(
      refundStatus: json['refundStatus'] as String? ?? 'pending_external_gateway',
      adminReviewCreated: json['adminReviewCreated'] as bool? ?? false,
      compensationReviewRequired:
          json['compensationReviewRequired'] as bool? ?? false,
      duplicateCancellation:
          json['duplicateCancellation'] as bool? ?? false,
    );
  }

  final String refundStatus;
  final bool adminReviewCreated;
  final bool compensationReviewRequired;
  final bool duplicateCancellation;
}

abstract interface class DriverRideCancellationApi {
  Future<DriverRideCancellationResult> cancelRide({
    required String rideId,
    required String reason,
    String? note,
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
