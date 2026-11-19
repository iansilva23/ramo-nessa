import '../domain/ramo_place.dart';

class PlaceAutocompleteSuggestion {
  const PlaceAutocompleteSuggestion({
    required this.placeId,
    required this.mainText,
    required this.secondaryText,
    required this.localOnly,
    this.approvedExternalId,
  });

  final String placeId;
  final String mainText;
  final String secondaryText;
  final bool localOnly;
  final String? approvedExternalId;
}

abstract interface class PlaceAutocompleteService {
  String beginSession();

  Future<List<PlaceAutocompleteSuggestion>> suggestions(
    String query, {
    required String sessionToken,
  });

  Future<RamoPlace> resolve(
    PlaceAutocompleteSuggestion suggestion, {
    required String sessionToken,
  });
}
