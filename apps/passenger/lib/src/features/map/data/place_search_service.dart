import 'package:latlong2/latlong.dart';

import '../domain/ramo_place.dart';

abstract interface class PlaceSearchService {
  Future<List<RamoPlace>> search(String query);
}


abstract interface class CoordinatePlaceResolver {
  Future<RamoPlace?> classifyCoordinate(LatLng coordinate);
}

abstract interface class CoordinateAddressResolver {
  Future<RamoPlace?> reverseCoordinate(LatLng coordinate);
}
