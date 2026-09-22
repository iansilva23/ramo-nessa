import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/nominatim_place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/osrm_route_service.dart';

void main() {
  test('Nominatim converte resultado em RamoPlace e limita busca local', () async {
    final client = MockClient((request) async {
      expect(request.headers['User-Agent'], contains('RamoNessa'));
      expect(request.url.queryParameters['countrycodes'], 'br');
      expect(request.url.queryParameters['bounded'], '1');
      expect(request.url.queryParameters['viewbox'], isNotEmpty);

      return http.Response(
        '[{"lat":"-2.7956","lon":"-40.5142","name":"Jericoacoara",'
        '"display_name":"Jericoacoara, Jijoca de Jericoacoara, Ceará, Brasil"}]',
        200,
      );
    });

    final service = NominatimPlaceSearchService(client: client);
    final results = await service.search('Jericoacoara');

    expect(results, hasLength(1));
    expect(results.first.name, 'Jericoacoara');
    expect(results.first.position.latitude, closeTo(-2.7956, 0.0001));
    expect(results.first.position.longitude, closeTo(-40.5142, 0.0001));
  });

  test('Nominatim reutiliza cache para a mesma busca', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return http.Response(
        '[{"lat":"-2.7956","lon":"-40.5142","name":"Jericoacoara",'
        '"display_name":"Jericoacoara, Ceará, Brasil"}]',
        200,
      );
    });

    final service = NominatimPlaceSearchService(client: client);

    await service.search('Jericoacoara');
    await service.search('  JERICOACOARA  ');

    expect(requests, 1);
  });

  test('OSRM converte GeoJSON em rota, distância e ETA', () async {
    final client = MockClient((request) async {
      expect(request.url.path, contains('/route/v1/driving/'));

      return http.Response(
        '{"code":"Ok","routes":[{"distance":4200.0,"duration":600.0,'
        '"geometry":{"coordinates":[[-40.5142,-2.7956],[-40.4500,-2.8100]]}}]}',
        200,
      );
    });

    final service = OsrmRouteService(client: client);
    final route = await service.route(
      origin: const LatLng(-2.7956, -40.5142),
      destination: const LatLng(-2.8100, -40.4500),
    );

    expect(route.points, hasLength(2));
    expect(route.distanceMeters, 4200);
    expect(route.duration, const Duration(minutes: 10));
    expect(route.distanceLabel, '4,2 km');
    expect(route.durationLabel, '10 min');
  });
}
