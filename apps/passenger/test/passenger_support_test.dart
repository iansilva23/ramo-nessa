import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_support_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_support_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_support_screen.dart';

void main() {
  test('suporte usa Bearer e nunca coloca sessão na URL', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') {
        return http.Response('{"tickets":[]}', 200);
      }
      return http.Response(
        jsonEncode({
          'id': 'ticket-passenger-001',
          'category': 'ride',
          'subject': 'Ponto de embarque',
          'message': 'Meu ponto de embarque está incorreto.',
          'status': 'open',
          'createdAt': '2026-09-28T07:15:00.000Z',
          'updatedAt': '2026-09-28T07:15:00.000Z',
        }),
        201,
      );
    });
    final service = HttpPassengerSupportService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-support-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    expect(await service.listTickets(), isEmpty);
    await service.createTicket(
      category: 'ride',
      subject: 'Ponto de embarque',
      message: 'Meu ponto de embarque está incorreto.',
    );

    expect(requests, hasLength(2));
    for (final request in requests) {
      expect(request.url.path, '/v1/passenger/me/support');
      expect(request.url.toString(), isNot(contains('support-token')));
      expect(
        request.headers['authorization'],
        'Bearer passenger-support-token-abcdefghijklmnopqrstuvwxyz',
      );
    }
  });

  testWidgets('passageiro cria e visualiza chamado', (tester) async {
    final service = _FakePassengerSupportService();
    await tester.pumpWidget(
      MaterialApp(home: PassengerSupportScreen(service: service)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('passenger-support-subject')),
      'Pagamento pendente',
    );
    await tester.enterText(
      find.byKey(const Key('passenger-support-message')),
      'Meu pagamento continua pendente no aplicativo.',
    );
    final submit = find.byKey(const Key('passenger-support-submit'));
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.text('Pagamento pendente'), findsOneWidget);
    expect(find.text('Chamado enviado ao suporte.'), findsOneWidget);
  });
}

class _FakePassengerSupportService implements PassengerSupportService {
  final List<PassengerSupportTicket> tickets = [];

  @override
  Future<PassengerSupportTicket> createTicket({
    required String category,
    required String subject,
    required String message,
  }) async {
    final ticket = PassengerSupportTicket(
      id: 'ticket-test',
      category: category,
      subject: subject,
      message: message,
      status: 'open',
      createdAt: DateTime.utc(2026, 9, 28),
    );
    tickets.add(ticket);
    return ticket;
  }

  @override
  Future<List<PassengerSupportTicket>> listTickets() async =>
      List.unmodifiable(tickets);
}
