import '../domain/ramo_place.dart';

abstract interface class PlaceSearchService {
  Future<List<RamoPlace>> search(String query);
}
