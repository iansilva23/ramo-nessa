import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_route_service.dart';
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

  test('Nominatim permite destino externo somente quando aprovado', () async {
    final client = MockClient((request) async {
      expect(request.url.queryParameters['bounded'], isNull);
      expect(request.url.queryParameters['viewbox'], isNull);
      expect(request.url.queryParameters['q'], contains('Sobral'));

      return http.Response(
        '[{"lat":"-3.68","lon":"-40.35","name":"Sobral",'
        '"display_name":"Sobral, Ceará, Brasil"}]',
        200,
      );
    });

    final service = NominatimPlaceSearchService(client: client);
    final results = await service.search('Sobral');

    expect(results, hasLength(1));
    expect(results.first.name, 'Sobral');
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

  test('Nominatim rejeita JSON inválido de forma controlada', () async {
    final client = MockClient((_) async => http.Response('<html>erro</html>', 200));
    final service = NominatimPlaceSearchService(client: client);

    await expectLater(
      service.search('Jericoacoara'),
      throwsA(isA<FormatException>()),
    );
  });

  test('Core converte rota Valhalla normalizada em RouteInfo', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"provider":"valhalla","distanceMeters":4200,'
        '"durationSeconds":600,"points":['
        '{"latitude":-2.7956,"longitude":-40.5142},'
        '{"latitude":-2.81,"longitude":-40.45}],'
        '"maneuvers":[]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = CoreRouteService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-route-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );
    final route = await service.route(
      origin: const LatLng(-2.7956, -40.5142),
      destination: const LatLng(-2.8100, -40.4500),
    );

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/maps/route');
    expect(
      captured.headers['authorization'],
      'Bearer passenger-route-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(route.points, hasLength(2));
    expect(route.distanceMeters, 4200);
    expect(route.duration, const Duration(minutes: 10));
  });

  test('OSRM rejeita coordenadas não numéricas', () async {
    final client = MockClient(
      (_) async => http.Response(
        '{"code":"Ok","routes":[{"distance":1000,"duration":120,'
        '"geometry":{"coordinates":[["x","y"],[-40.45,-2.81]]}}]}',
        200,
      ),
    );
    final service = OsrmRouteService(client: client);

    await expectLater(
      service.route(
        origin: const LatLng(-2.7956, -40.5142),
        destination: const LatLng(-2.8100, -40.4500),
      ),
      throwsA(isA<FormatException>()),
    );
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
