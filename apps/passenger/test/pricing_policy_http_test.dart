import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_policy_service.dart';

void main() {
  test('política pública controla categorias, zonas e limites do Buggy', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'enabledCategories': ['car', 'comfort_black', 'buggy'],
          'enabledZones': ['jericoacoara', 'jijoca', 'external'],
          'buggy': {
            'minPassengers': 2,
            'maxPassengers': 6,
          },
          'localityPolicies': {
            'prea': [
              {
                'localityId': 'lagoa-grande',
                'enabledCategories': [
                  'moto',
                  'delivery',
                  'comfort_black',
                ],
              },
            ],
            'jijoca': [
              {
                'localityId': 'mangue-seco',
                'enabledCategories': ['moto', 'car'],
              },
            ],
          },
          'pricingCatalog': {
            'catalogVersion': 'v1',
            'catalogVersionNumber': 7,
          },
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPricingPolicyService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: client,
    );

    final policy = await service.load();

    expect(captured.method, 'GET');
    expect(captured.url.path, '/v1/pricing/policy');
    expect(policy.enabledCategories, {
      'car',
      'comfort_black',
      'buggy',
    });
    expect(policy.enabledZones, {
      'jericoacoara',
      'jijoca',
      'external',
    });
    expect(policy.buggyMinPassengers, 2);
    expect(policy.buggyMaxPassengers, 6);
    expect(
      policy.localityCategories(
        zoneId: 'prea',
        localityId: 'lagoa-grande',
      ),
      {'moto', 'delivery', 'comfort_black'},
    );
    expect(
      policy.localityCategories(
        zoneId: 'jijoca',
        localityId: 'mangue-seco',
      ),
      {'moto', 'car'},
    );
    expect(
      policy.localityCategories(
        zoneId: 'external',
        localityId: 'sobral',
      ),
      isNull,
    );
  });

  test('rejeita limites inválidos do Buggy', () {
    expect(
      () => PassengerPricingPolicy.fromJson({
        'enabledCategories': ['buggy'],
        'enabledZones': ['jericoacoara'],
        'buggy': {
          'minPassengers': 5,
          'maxPassengers': 4,
        },
      }),
      throwsFormatException,
    );
  });
}
