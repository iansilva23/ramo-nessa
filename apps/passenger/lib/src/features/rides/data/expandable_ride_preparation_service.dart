import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../domain/prepared_ride.dart';

class RideSearchRequest {
  const RideSearchRequest({required this.service, required this.origin, required this.destination,
    required this.originZoneId, required this.destinationZoneId, required this.route, this.passengers = 1});
  final ServiceType service;
  final RamoPlace origin;
  final RamoPlace destination;
  final String originZoneId;
  final String destinationZoneId;
  final RouteInfo route;
  final int passengers;
}
class DriverSearchOptions {
  const DriverSearchOptions({required this.nearbyKm, required this.expandedKm, required this.allowExpansion,
    required this.feeDescription});
  factory DriverSearchOptions.fromJson(Map<String, dynamic> json) {
    final tiers = json['pickupFees'] as List<dynamic>? ?? const [];
    final custom = json['useCustomPickupFees'] == true;
    return DriverSearchOptions(
      nearbyKm: (json['nearbyKm'] as num).toDouble(), expandedKm: (json['expandedKm'] as num).toDouble(),
      allowExpansion: json['allowExpansion'] == true,
      feeDescription: custom ? tiers.map((raw) {
        final tier = raw as Map<String, dynamic>;
        return 'Até ${tier['upToKm']} km: ${PreparedRide.formatCents((tier['amountCents'] as num).toInt())}';
      }).join('\n') : 'Pode haver adicional pelo deslocamento até você. O valor será mostrado antes do pagamento.',
    );
  }
  final double nearbyKm;
  final double expandedKm;
  final bool allowExpansion;
  final String feeDescription;
}
abstract interface class ExpandableRidePreparationService {
  Future<DriverSearchOptions> searchOptions(ServiceType service);
  Future<PreparedRide> prepareWithRadius(RideSearchRequest request, double radiusKm);
}
