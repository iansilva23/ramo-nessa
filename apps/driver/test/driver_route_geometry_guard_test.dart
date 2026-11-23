import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_route_service.dart';

void main() {
  const origin = LatLng(-2.82017, -40.41467);
  const destination = LatLng(-2.89860, -40.45060);

  Map<String, dynamic> validRoute() => {
    'points': [
      {'latitude': origin.latitude, 'longitude': origin.longitude},
      {'latitude': -2.85, 'longitude': -40.43},
      {'latitude': destination.latitude, 'longitude': destination.longitude},
    ],
    'distanceMeters': 14000,
    'durationSeconds': 1800,
    'maneuvers': [
      {'instruction': 'Siga em frente', 'distanceMeters': 500},
    ],
  };

  test('rota válida conserva instruções e ETA do Motorista', () async {
    var calls = 0;
    final service = CoreDriverRouteService(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((request) async {
        calls++;
        expect(request.url.path, '/v1/maps/route');
        return http.Response(jsonEncode(validRoute()), 200);
      }),
    );
    final route = await service.route(origin: origin, destination: destination);
    expect(calls, 1);
    expect(route.points.length, 3);
    expect(route.distanceMeters, 14000);
    expect(route.duration, const Duration(minutes: 30));
    expect(route.maneuvers.length, 1);
  });

  test('GPS inválido não consulta nem servidor nem Maps', () async {
    var calls = 0;
    final service = CoreDriverRouteService(
      baseUrl: Uri.parse('https://core.example.invalid'),
      client: MockClient((request) async {
        calls++;
        return http.Response(jsonEncode(validRoute()), 200);
      }),
    );
    for (final invalid in [
      const LatLng(0, 0),
      const LatLng(double.infinity, -40.4),
      const LatLng(-91, -40.4),
      const LatLng(-2.82, 200),
    ]) {
      await expectLater(
        service.route(origin: invalid, destination: destination),
        throwsA(isA<FormatException>()),
      );
    }
    expect(calls, 0);
  });

  test('resposta com salto a outro estado, GPS impossível ou dado ruim falha', () async {
    final samples = <Map<String, dynamic>>[
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          {'latitude': -23.55, 'longitude': -46.63},
          {'latitude': destination.latitude, 'longitude': destination.longitude},
        ],
      },
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          {'latitude': -95, 'longitude': -40.4},
        ],
      },
      {
        ...validRoute(),
        'points': [
          {'latitude': origin.latitude, 'longitude': origin.longitude},
          'ponto-corrompido',
          {'latitude': destination.latitude, 'longitude': destination.longitude},
        ],
      },
      {...validRoute(), 'distanceMeters': -20},
      {...validRoute(), 'durationSeconds': -20},
      {...validRoute(), 'durationSeconds': 31536001},
    ];
    for (final response in samples) {
      final service = CoreDriverRouteService(
        baseUrl: Uri.parse('https://core.example.invalid'),
        client: MockClient((request) async =>
            http.Response(jsonEncode(response), 200)),
      );
      await expectLater(
        service.route(origin: origin, destination: destination),
        throwsA(isA<FormatException>()),
      );
    }
  });
}
