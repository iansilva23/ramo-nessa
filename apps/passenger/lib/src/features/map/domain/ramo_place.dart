import 'package:latlong2/latlong.dart';

class RamoPlace {
  const RamoPlace({
    required this.name,
    required this.address,
    required this.position,
    this.providerPlaceId,
    this.approvedExternalId,
    this.approvedPricingZoneId,
    this.approvedPricingLocalityId,
    this.placeProof,
  });

  final String name;
  final String address;
  final LatLng position;
  final String? providerPlaceId;
  final String? approvedExternalId;
  final String? approvedPricingZoneId;
  final String? approvedPricingLocalityId;
  final String? placeProof;

  String get displayName => name.trim().isEmpty ? address : name;
}
