import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

const ride = RamoRideActivityData(
    id: 'same-ride',
    state: 'DRIVER_ARRIVED',
    origin: 'Praça da Matriz',
    destination: 'Rua das Flores, 120',
    category: 'moto',
    amountCents: 1250,
    paymentMethod: 'pix',
    paymentStatus: 'paid',
    participant: 'Ana Costa');

class SupportFixture implements RamoRideSupportApi {
  String? sentId, reason;
  int calls = 0;
  @override
  Future<void> createRideSupportTicket(
      {required String rideId,
      required String reason,
      required String description}) async {
    calls++;
    sentId = rideId;
    this.reason = reason;
  }

  @override
  Future<List<Map<String, dynamic>>> rideSupportTickets(String rideId) async =>
      calls == 0
          ? []
          : [
              {
                'id': 'ticket',
                'subject': reason,
                'message': 'Relato enviado',
                'status': 'in_progress',
                'response': 'Vamos analisar os registros da corrida.'
              }
            ];
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
        'driver card fits 320 px and opening never starts a ride ($dark)',
        (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var opens = 0;
      await tester.pumpWidget(MaterialApp(
          theme: dark ? RamoTheme.dark : RamoTheme.light,
          home: Scaffold(
              body: Padding(
                  padding: const EdgeInsets.all(22),
                  child: RamoRideActivityCard(
                      ride: ride,
                      driver: true,
                      onOpen: () => opens++,
                      onHelp: () {})))));
      expect(opens, 0);
      await tester.tap(find.text('Retomar corrida'));
      await tester.pump();
      expect(opens, 1);
      expect(find.text('Iniciar trajeto'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
      'driver support links the selected ride and exposes the moderation reply',
      (tester) async {
    final api = SupportFixture();
    await tester.pumpWidget(MaterialApp(
        theme: RamoTheme.light,
        home: RamoRideSupportScreen(api: api, ride: ride, driver: true)));
    await tester.pumpAndSettle();
    expect(api.calls, 0);
    await tester.tap(find.text('Não encontrei o passageiro'));
    await tester.scrollUntilVisible(find.text('Enviar para moderação'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Enviar para moderação'));
    await tester.pumpAndSettle();
    expect(api.sentId, 'same-ride');
    expect(api.reason, 'Não encontrei o passageiro');
    expect(api.calls, 1);
    expect(find.text('Moderação: Vamos analisar os registros da corrida.'),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
