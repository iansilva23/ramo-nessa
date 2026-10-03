import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/core/location/geolocator_location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_autocomplete_service.dart';
import 'package:ramo_nessa_passenger/src/preview/passenger_preview_dependencies.dart';

void main() {
  test('Preview usa GPS do aparelho sem posição fixa de demonstração', () {
    expect(PassengerPreviewDependencies().location,
        isA<GeolocatorLocationService>());
  });

  test('Preview sugere destinos conhecidos enquanto o passageiro digita', () async {
    final dependencies = PassengerPreviewDependencies();
    final autocomplete = dependencies.places as PlaceAutocompleteService;
    final session = autocomplete.beginSession();

    final suggestions = await autocomplete.suggestions(
      'Pra',
      sessionToken: session,
    );

    expect(suggestions, isNotEmpty);
    expect(suggestions.first.mainText, 'Praia do Preá');

    final place = await autocomplete.resolve(
      suggestions.first,
      sessionToken: session,
    );
    expect(place.name, 'Praia do Preá');
    expect(place.position.latitude, -2.8154);
    expect(place.position.longitude, -40.4074);
  });

  test('Preview não inventa coordenadas para destino desconhecido', () async {
    final dependencies = PassengerPreviewDependencies();
    final autocomplete = dependencies.places as PlaceAutocompleteService;

    expect(await dependencies.places.search('Lugar inexistente'), isEmpty);
    expect(
      await autocomplete.suggestions(
        'Lugar inexistente',
        sessionToken: autocomplete.beginSession(),
      ),
      isEmpty,
    );
  });

  test('desenho da rota avança progressivamente até o destino', () {
    const route = [
      LatLng(-2.7956, -40.5142),
      LatLng(-2.8000, -40.5000),
      LatLng(-2.8154, -40.4074),
    ];

    final halfway = ramoVisibleRoutePoints(route, .5);
    expect(halfway.first.latitude, route.first.latitude);
    expect(halfway.first.longitude, route.first.longitude);
    expect(halfway.last.latitude, route[1].latitude);
    expect(halfway.last.longitude, route[1].longitude);
    expect(ramoVisibleRoutePoints(route, 1), same(route));
  });
}
