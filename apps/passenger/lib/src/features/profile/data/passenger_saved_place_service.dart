import 'package:latlong2/latlong.dart';

class PassengerSavedPlace {
  const PassengerSavedPlace({
    required this.id,
    required this.kind,
    required this.label,
    required this.name,
    required this.address,
    required this.position,
    this.providerPlaceId,
    this.approvedPricingZoneId,
    this.approvedPricingLocalityId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PassengerSavedPlace.fromJson(Map<String, dynamic> json) {
    return PassengerSavedPlace(
      id: json['id'] as String,
      kind: json['kind'] as String,
      label: json['label'] as String,
      name: json['name'] as String,
      address: json['address'] as String,
      position: LatLng(
        (json['latitude'] as num).toDouble(),
        (json['longitude'] as num).toDouble(),
      ),
      providerPlaceId:
          json['providerPlaceId']?.toString().trim().isNotEmpty == true
              ? json['providerPlaceId'].toString().trim()
              : null,
      approvedPricingZoneId:
          json['approvedPricingZoneId']?.toString().trim().isNotEmpty == true
              ? json['approvedPricingZoneId'].toString().trim()
              : null,
      approvedPricingLocalityId:
          json['approvedPricingLocalityId']
                      ?.toString()
                      .trim()
                      .isNotEmpty ==
                  true
              ? json['approvedPricingLocalityId'].toString().trim()
              : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String kind;
  final String label;
  final String name;
  final String address;
  final LatLng position;
  final String? providerPlaceId;
  final String? approvedPricingZoneId;
  final String? approvedPricingLocalityId;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class PassengerSavedPlaceException implements Exception {
  const PassengerSavedPlaceException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class PassengerSavedPlaceService {
  Future<List<PassengerSavedPlace>> list();

  Future<PassengerSavedPlace> save({
    required String kind,
    String? label,
    required String name,
    required String address,
    required LatLng position,
    String? providerPlaceId,
    String? approvedPricingZoneId,
    String? approvedPricingLocalityId,
  });

  Future<void> delete(String id);
}
