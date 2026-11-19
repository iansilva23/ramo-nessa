import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_route_service.dart';

void main() {
  const origin = LatLng(-2.82017, -40.41467); // Preá
  const destination = LatLng(-2.89860, -40.45060); // Jijoca

  Map<String, dynamic> validRoute() => {
    'points': [
      {'latitude': origin.latitude, 'longitude': origin.longitude},
      {'latitude': -2.85, 'longitude': -40.43},
      {'latitude': destination.latitude, 'longitude': destination.longitude},
    ],
    'distanceMeters': 14000,
    'durationSeconds': 1800,
  };

  test('usa resposta válida sem chamadas ao Google Maps', () async {
    var httpCalls = 0;
    final service = CoreRouteService(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((request) async {
        httpCalls++;
        expect(request.url.path, '/v1/maps/route');
        return http.Response(jsonEncode(validRoute()), 200);
      }),
    );
    final result = await service.route(origin: origin, destination: destination);
    expect(httpCalls, 1);
    expect(result.points.length, 3);
    expect(result.distanceMeters, 14000);
    expect(result.duration, const Duration(minutes: 30));
  });

  test('GPS inválido na origem ou destino não faz nenhuma requisição', () async {
    var httpCalls = 0;
    final service = CoreRouteService(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((request) async {
        httpCalls++;
        return http.Response(jsonEncode(validRoute()), 200);
      }),
    );
    for (final point in [
      const LatLng(0, 0),
      const LatLng(92, -40.4),
      const LatLng(-2.8, 181),
      const LatLng(double.nan, -40.4),
    ]) {
      await expectLater(
        service.route(origin: point, destination: destination),
        throwsA(isA<FormatException>()),
      );
    }
    expect(httpCalls, 0);
  });

  test('não aceita rota que salta para outro estado nem pontos malformados', () async {
    final cases = <Map<String, dynamic>>[
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          {'latitude': -23.55, 'longitude': -46.63}, // São Paulo
          {'latitude': destination.latitude, 'longitude': destination.longitude},
        ],
      },
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          {'latitude': 95, 'longitude': -40.4},
          {'latitude': destination.latitude, 'longitude': destination.longitude},
        ],
      },
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          {'latitude': 'erro', 'longitude': -40.43},
          {'latitude': destination.latitude, 'longitude': destination.longitude},
        ],
      },
      {...validRoute(), 'distanceMeters': -1},
      {...validRoute(), 'durationSeconds': -1},
      {...validRoute(), 'durationSeconds': 31536001},
    ];
    for (final badRoute in cases) {
      final service = CoreRouteService(
        baseUrl: Uri.parse('https://core.example.invalid'),
        client: MockClient((request) async =>
            http.Response(jsonEncode(badRoute), 200)),
      );
      await expectLater(
        service.route(origin: origin, destination: destination),
        throwsA(isA<FormatException>()),
      );
    }
  });

  test('não descarta pontos inválidos criando reta artificial', () async {
    final response = validRoute();
    response['points'] = [
      {'latitude': origin.latitude, 'longitude': origin.longitude},
      'coordenada-corrompida',
      {'latitude': destination.latitude, 'longitude': destination.longitude},
    ];
    final service = CoreRouteService(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((request) async =>
          http.Response(jsonEncode(response), 200)),
    );
    await expectLater(
      service.route(origin: origin, destination: destination),
      throwsA(isA<FormatException>()),
    );
  });
}
