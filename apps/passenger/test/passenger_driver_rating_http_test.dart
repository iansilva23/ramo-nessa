import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_ride_tracking_service.dart';

void main() {
  test('avaliação usa endpoint da corrida com Bearer e estrelas', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"stars":5,"ratingAverage":4.9,"ratingCount":21,"duplicate":false}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerRideTrackingService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-rating-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final result = await service.rateDriver('ride-rating-1', 5);

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/rides/ride-rating-1/rating');
    expect(
      captured.headers['authorization'],
      'Bearer passenger-rating-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(jsonDecode(captured.body), {'stars': 5});
    expect(result.stars, 5);
    expect(result.ratingAverage, 4.9);
    expect(result.ratingCount, 21);
    expect(result.duplicate, isFalse);
  });
}
