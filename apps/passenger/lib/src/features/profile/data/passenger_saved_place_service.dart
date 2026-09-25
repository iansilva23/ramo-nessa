import 'package:latlong2/latlong.dart';

class PassengerSavedPlace {
  const PassengerSavedPlace({
    required this.id,
    required this.kind,
    required this.label,
    required this.name,
    required this.address,
    required this.position,
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
  });

  Future<void> delete(String id);
}
