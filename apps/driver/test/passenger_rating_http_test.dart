import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/home/data/http_driver_api.dart';

void main() {
  test('rating client authenticates GET and POST and handles an idempotent response', () async {
    final requests = <http.Request>[];
    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://core.example.invalid'),
      accessToken: ' token ',
      client: MockClient((r) async {
        requests.add(r);
        expect(r.headers['authorization'], 'Bearer token');
        expect(r.url.path, '/v1/driver/me/rides/ride/passenger-rating');
        return http.Response(
          jsonEncode({
            'rating': r.method == 'GET'
                ? null
                : {
                    'stars': 4,
                    'reasons': ['polite'],
                    'comment': 'Bom',
                  },
          }),
          200,
        );
      }),
    );
    expect(await api.passengerRating('ride'), isNull);
    final rating = await api.ratePassenger(
      rideId: 'ride',
      stars: 4,
      reasons: ['polite'],
      comment: 'Bom',
    );
    expect(rating.stars, 4);
    expect(rating.comment, 'Bom');
    expect(jsonDecode(requests.last.body), {
      'stars': 4,
      'reasons': ['polite'],
      'comment': 'Bom',
    });
  });
  test(
    'rating client propagates server failures instead of claiming success',
    () async {
      final api = HttpDriverApi(
        baseUrl: Uri.parse('https://core.example.invalid'),
        client: MockClient(
          (_) async =>
              http.Response('{"message":"Corrida não concluída"}', 409),
        ),
      );
      await expectLater(
        api.ratePassenger(rideId: 'ride', stars: 5, reasons: []),
        throwsException,
      );
    },
  );
}
