import '../../../core/location/driver_location_service.dart';
import '../domain/driver_models.dart';

abstract interface class DriverApi {
  Future<DriverSupplySnapshot> getSupply();

  Future<DriverSupplySnapshot> updateSupply({
    bool? online,
    DriverPosition? position,
  });

  Future<DriverOffer?> currentOffer();

  Future<AcceptedDriverRide> acceptOffer(String offerId);

  Future<String> rejectOffer(String offerId);
}

class DriverApiException implements Exception {
  const DriverApiException(this.message);

  final String message;

  @override
  String toString() => message;
}
