import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_route_service.dart';

void main() {
  test('Core busca lugares via Google Places e converte RamoPlace', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"provider":"google","places":['
        '{"id":"jeri","name":"Jericoacoara",'
        '"address":"Jericoacoara, Jijoca de Jericoacoara - CE",'
        '"latitude":-2.7956,"longitude":-40.5142}]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-place-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final results = await service.search('Jericoacoara');

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/maps/places/search');
    expect(
      captured.headers['authorization'],
      'Bearer passenger-place-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(captured.body, contains('"localOnly":true'));
    expect(results, hasLength(1));
    expect(results.first.name, 'Jericoacoara');
    expect(results.first.position.latitude, closeTo(-2.7956, 0.0001));
    expect(results.first.position.longitude, closeTo(-40.5142, 0.0001));
  });

  test('Core libera destino externo aprovado sem filtro local', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"provider":"google","places":['
        '{"id":"sobral","name":"Sobral","address":"Sobral - CE",'
        '"latitude":-3.6880,"longitude":-40.3499}]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: client,
    );

    final results = await service.search('Sobral');

    expect(captured.body, contains('"localOnly":false'));
    expect(captured.body, contains('Sobral'));
    expect(results, hasLength(1));
    expect(results.first.name, 'Sobral');
  });

  test('Core reutiliza cache para a mesma busca de lugar', () async {
    var requests = 0;
    final client = MockClient((_) async {
      requests++;
      return http.Response(
        '{"provider":"google","places":['
        '{"id":"jeri","name":"Jericoacoara",'
        '"address":"Jericoacoara, CE",'
        '"latitude":-2.7956,"longitude":-40.5142}]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: client,
    );

    await service.search('Jericoacoara');
    await service.search('  JERICOACOARA  ');

    expect(requests, 1);
  });

  test('Core Places rejeita JSON inválido de forma controlada', () async {
    final client = MockClient(
      (_) async => http.Response('<html>erro</html>', 200),
    );
    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: client,
    );

    await expectLater(
      service.search('Jericoacoara'),
      throwsA(isA<FormatException>()),
    );
  });

  test('Core converte rota Google normalizada em RouteInfo', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"provider":"google","distanceMeters":4200,'
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
    expect(route.distanceLabel, '4,2 km');
    expect(route.durationLabel, '10 min');
  });

  test('Core gera UUID v4 diferente para cada sessão Places', () {
    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
    );

    final first = service.beginSession();
    final second = service.beginSession();
    final uuidV4 = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );

    expect(uuidV4.hasMatch(first), isTrue);
    expect(uuidV4.hasMatch(second), isTrue);
    expect(second, isNot(first));
  });

  test('Core usa a mesma sessão em autocomplete e detalhes', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);

      if (request.url.path == '/v1/maps/places/autocomplete') {
        return http.Response(
          '{"provider":"google","suggestions":['
          '{"placeId":"jeri","mainText":"Jericoacoara",'
          '"secondaryText":"Jijoca de Jericoacoara - CE"}]}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }

      if (request.url.path == '/v1/maps/places/details') {
        return http.Response(
          '{"provider":"google","place":{'
          '"id":"jeri","address":"Jericoacoara, CE",'
          '"latitude":-2.7956,"longitude":-40.5142}}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }

      return http.Response('{}', 404);
    });

    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-place-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );
    const token = '3519edfe-0f75-4a30-bfe4-7cbd89340b2c';

    final suggestions = await service.suggestions(
      'Jeri',
      sessionToken: token,
    );
    expect(suggestions, hasLength(1));
    expect(suggestions.first.mainText, 'Jericoacoara');

    final place = await service.resolve(
      suggestions.first,
      sessionToken: token,
    );

    expect(requests, hasLength(2));
    expect(requests[0].url.path, '/v1/maps/places/autocomplete');
    expect(requests[0].body, contains('"sessionToken":"$token"'));
    expect(requests[0].body, contains('"localOnly":true'));
    expect(requests[1].url.path, '/v1/maps/places/details');
    expect(requests[1].body, contains('"sessionToken":"$token"'));
    expect(requests[1].body, contains('"placeId":"jeri"'));
    expect(place.name, 'Jericoacoara');
    expect(place.address, 'Jericoacoara, CE');
    expect(place.position.latitude, closeTo(-2.7956, 0.0001));
  });

  test('autocomplete só abre área externa para destino aprovado único', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"provider":"google","suggestions":['
        '{"placeId":"sobral","mainText":"Sobral",'
        '"secondaryText":"Ceará, Brasil"}]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = CorePlaceSearchService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: client,
    );

    final suggestions = await service.suggestions(
      'sob',
      sessionToken: '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
    );

    expect(captured.url.path, '/v1/maps/places/autocomplete');
    expect(captured.body, contains('Sobral'));
    expect(captured.body, contains('"localOnly":false'));
    expect(suggestions.single.approvedExternalId, 'sobral');
  });

}
