import 'package:latlong2/latlong.dart';

class RamoPlace {
  const RamoPlace({
    required this.name,
    required this.address,
    required this.position,
  });

  final String name;
  final String address;
  final LatLng position;

  String get displayName => name.trim().isEmpty ? address : name;
}
