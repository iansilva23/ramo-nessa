import 'dart:async';
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

  testWidgets('falha de carregamento não vira lista vazia e permite retry',
      (tester) async {
    final service = _FakePassengerSupportService();
    service.listHandler = () async =>
        throw const PassengerSupportException('Conexão indisponível.');
    await tester.pumpWidget(
      MaterialApp(home: PassengerSupportScreen(service: service)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsNothing);
    expect(find.text('Conexão indisponível.'), findsOneWidget);

    service.listHandler = null;
    final retry = find.byKey(const Key('passenger-support-retry'));
    await tester.ensureVisible(retry);
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(find.text('Conexão indisponível.'), findsNothing);
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsOneWidget);
  });

  testWidgets('refresh falho não apresenta resposta antiga como atual',
      (tester) async {
    final service = _FakePassengerSupportService();
    await service.createTicket(
      category: 'ride',
      subject: 'Resposta antiga',
      message: 'Um chamado já existente para testar atualização.',
    );
    await tester.pumpWidget(
      MaterialApp(home: PassengerSupportScreen(service: service)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Resposta antiga'), findsOneWidget);
    service.listHandler = () async =>
        throw const PassengerSupportException('Falha ao atualizar.');
    await tester.widget<RefreshIndicator>(find.byType(RefreshIndicator)).onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Resposta antiga'), findsNothing);
    expect(find.text('Falha ao atualizar.'), findsOneWidget);
  });

  testWidgets('resposta antiga de listagem não sobrescreve chamado novo',
      (tester) async {
    final initialLoad = Completer<List<PassengerSupportTicket>>();
    final service = _FakePassengerSupportService();
    service.listHandler = () => initialLoad.future;
    await tester.pumpWidget(
      MaterialApp(home: PassengerSupportScreen(service: service)),
    );
    await tester.pump();
    service.listHandler = null;
    await _submitTicket(tester);
    await tester.pumpAndSettle();
    initialLoad.complete([]);
    await tester.pumpAndSettle();
    expect(find.text('Pagamento pendente'), findsOneWidget);
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsNothing);
  });

  testWidgets('Preview informa que chamado não chega à equipe', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PassengerSupportScreen(
        service: _FakePassengerSupportService(),
        previewMode: true,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('passenger-support-preview-notice')),
        findsOneWidget);
    await _submitTicket(tester);
    await tester.pumpAndSettle();
    expect(find.text('Chamado enviado ao suporte.'), findsNothing);
    expect(find.text('Chamado de demonstração salvo somente neste teste.'),
        findsOneWidget);
  });

  testWidgets('sair durante envio não atualiza a tela descartada',
      (tester) async {
    final creation = Completer<PassengerSupportTicket>();
    final service = _FakePassengerSupportService();
    service.createHandler = () => creation.future;
    await tester.pumpWidget(
      MaterialApp(home: PassengerSupportScreen(service: service)),
    );
    await tester.pumpAndSettle();
    await _submitTicket(tester);
    await tester.pumpWidget(const SizedBox.shrink());
    service.createHandler = null;
    creation.complete(await service.createTicket(
      category: 'payment',
      subject: 'Pagamento pendente',
      message: 'Meu pagamento continua pendente no aplicativo.',
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(service.listCalls, 1);
  });
}

Future<void> _submitTicket(WidgetTester tester) async {
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
}

class _FakePassengerSupportService implements PassengerSupportService {
  final List<PassengerSupportTicket> tickets = [];
  Future<List<PassengerSupportTicket>> Function()? listHandler;
  Future<PassengerSupportTicket> Function()? createHandler;
  int listCalls = 0;

  @override
  Future<PassengerSupportTicket> createTicket({
    required String category,
    required String subject,
    required String message,
  }) async {
    if (createHandler != null) return createHandler!();
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
  Future<List<PassengerSupportTicket>> listTickets() async {
    listCalls += 1;
    if (listHandler != null) return listHandler!();
    return List.unmodifiable(tickets);
  }
}
