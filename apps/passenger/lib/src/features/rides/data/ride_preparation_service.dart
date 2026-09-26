import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../domain/prepared_ride.dart';

abstract interface class RidePreparationService {
  Future<PreparedRide> prepare({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
  });
}

class RidePreparationException implements Exception {
  const RidePreparationException(this.message);

  final String message;

  @override
  String toString() => message;
}
