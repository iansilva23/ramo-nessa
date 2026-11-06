import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_privacy_service.dart';

void main() {
  test('privacidade usa Bearer e nunca coloca sessão na URL', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);

      if (request.method == 'GET') {
        return http.Response(
          jsonEncode({
            'legalDocuments': [
              {
                'documentType': 'privacy_policy',
                'version': 1,
                'title': 'Política publicada',
                'content':
                    'Conteúdo publicado pelo Core para validar a leitura no aplicativo.',
                'effectiveAt': '2026-09-28T00:00:00.000Z',
                'accepted': false,
                'acceptedAt': null,
              },
            ],
            'preferences': {
              'marketingNotificationsEnabled': false,
              'updatedAt': null,
            },
            'requests': [],
          }),
          200,
        );
      }

      if (request.url.path.endsWith('/legal-acceptances')) {
        return http.Response(
          jsonEncode({
            'documentType': 'privacy_policy',
            'version': 1,
            'acceptedAt': '2026-09-28T12:00:00.000Z',
          }),
          201,
        );
      }

      if (request.method == 'PATCH') {
        return http.Response(
          jsonEncode({
            'marketingNotificationsEnabled': true,
            'updatedAt': '2026-09-28T12:10:00.000Z',
          }),
          200,
        );
      }

      return http.Response(
        jsonEncode({
          'id': 'privacy-request-001',
          'requestType': 'access',
          'status': 'open',
          'note': 'Quero consultar meus dados.',
          'response': null,
          'respondedAt': null,
          'createdAt': '2026-09-28T12:20:00.000Z',
          'updatedAt': '2026-09-28T12:20:00.000Z',
        }),
        201,
      );
    });

    const token = 'passenger-privacy-token-abcdefghijklmnopqrstuvwxyz';
    final service = HttpPassengerPrivacyService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: token,
      client: client,
    );

    final overview = await service.overview();
    expect(overview.legalDocuments.single.title, 'Política publicada');

    await service.acceptLegalDocument(
      documentType: 'privacy_policy',
      version: 1,
    );

    final preferences =
        await service.updateMarketingNotifications(true);
    expect(preferences.marketingNotificationsEnabled, isTrue);

    final created = await service.createRequest(
      requestType: 'access',
      note: '  Quero consultar meus dados.  ',
    );
    expect(created.status, 'open');

    expect(requests, hasLength(4));
    expect(requests.map((request) => request.url.path), [
      '/v1/me/privacy',
      '/v1/me/privacy/legal-acceptances',
      '/v1/me/privacy/preferences',
      '/v1/me/privacy/requests',
    ]);

    for (final request in requests) {
      expect(request.url.toString(), isNot(contains('privacy-token')));
      expect(request.headers['authorization'], 'Bearer $token');
    }

    expect(
      jsonDecode(requests[1].body),
      {'documentType': 'privacy_policy', 'version': 1},
    );
    expect(
      jsonDecode(requests[2].body),
      {'marketingNotificationsEnabled': true},
    );
    expect(
      jsonDecode(requests[3].body),
      {
        'requestType': 'access',
        'note': 'Quero consultar meus dados.',
      },
    );
  });

  test('erro do Core preserva mensagem LGPD útil', () async {
    final service = HttpPassengerPrivacyService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-privacy-token-abcdefghijklmnopqrstuvwxyz',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'error': 'DUPLICATE_PRIVACY_REQUEST',
            'message':
                'Já existe uma solicitação desse tipo em atendimento.',
          }),
          409,
        ),
      ),
    );

    await expectLater(
      service.createRequest(requestType: 'access'),
      throwsA(
        predicate(
          (error) =>
              error.toString() ==
              'Já existe uma solicitação desse tipo em atendimento.',
        ),
      ),
    );
  });
}
