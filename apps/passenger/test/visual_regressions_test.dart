import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_growth_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_benefits_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_activity.dart';

void main() {
  testWidgets('editing marketing preferences does not overlap on a narrow screen', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = PassengerGrowthService(
      baseUrl: Uri.parse('https://core.example.test'),
      accessToken: 'test-access-token',
      client: MockClient((request) async => http.Response(
        jsonEncode({
          'preference': {
            'channels': {'inapp': false, 'push': false, 'email': false, 'whatsapp': false},
            'audience': 'unspecified',
            'zone': null,
            'birthdayMonthDay': null,
          },
          'benefits': [],
          'messages': [],
        }),
        200,
      )),
    );
    await tester.pumpWidget(MaterialApp(
      theme: RamoTheme.dark,
      home: PassengerBenefitsScreen(service: service),
    ));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('benefits-birthday-input')),
      170,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Aniversário (opcional)'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.byType(DropdownButtonFormField<String>).last,
      110,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Seu perfil (opcional)'), findsOneWidget);
    expect(find.text('Região de interesse (opcional)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('ride status labels stay user-friendly without changing backend state', () {
    PassengerActivityRide ride(String state) => PassengerActivityRide(
      id: 'test', state: state, category: 'moto', origin: 'Preá',
      destination: 'Jijoca', totalAmountCents: 1000,
      createdAt: DateTime(2026), updatedAt: DateTime(2026),
    );
    expect(ride('REFUNDED').stateLabel, 'Reembolsada');
    expect(ride('PAYMENT_FAILED').stateLabel, 'Falha no pagamento');
    expect(ride('AWAITING_PAYMENT').stateLabel, 'Aguardando pagamento');
    expect(ride('COMPLETED').stateLabel, 'Concluída');
    expect(ride('REFUNDED').state, 'REFUNDED');
  });
}
