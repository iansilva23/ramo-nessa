import 'package:latlong2/latlong.dart';

class PassengerSavedPlace {
  const PassengerSavedPlace({
    required this.id,
    required this.kind,
    required this.label,
    required this.name,
    required this.address,
    required this.position,
    this.addressDetails = const {},
    this.providerPlaceId,
    this.approvedPricingZoneId,
    this.approvedPricingLocalityId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PassengerSavedPlace.fromJson(Map<String, dynamic> json) {
    return PassengerSavedPlace(
      addressDetails: json['addressDetails'] is Map
          ? Map<String, dynamic>.from(json['addressDetails'] as Map) : const {},
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

  final Map<String, dynamic> addressDetails;
  bool get mapPinned => addressDetails['mapPinned'] == true;
  String get fullAddress => [
    address,
    if (addressDetails['noNumber'] == true) 'Sem número'
    else if (addressDetails['houseNumber'] != null) 'Nº ${addressDetails['houseNumber']}',
    if (addressDetails['complement'] != null) addressDetails['complement'].toString(),
    if (addressDetails['reference'] != null) 'Referência: ${addressDetails['reference']}',
  ].join(' — ');
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
    String? id,
    Map<String, dynamic>? addressDetails,
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
