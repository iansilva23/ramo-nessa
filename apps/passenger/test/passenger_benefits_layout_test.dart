import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_growth_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_benefits_screen.dart';

void main() {
  testWidgets('benefícios permite salvar aniversário em tela pequena com fonte ampliada', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Map<String, dynamic>? saved;
    final service = PassengerGrowthService(
      baseUrl: Uri.parse('https://example.invalid'), accessToken: 'test',
      client: MockClient((request) async {
        if (request.method == 'PUT') saved = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({
          'preference': {'channels': <String, dynamic>{}, 'audience': 'unspecified'},
          'benefits': <dynamic>[], 'messages': <dynamic>[],
        }), 200);
      }),
    );
    await tester.pumpWidget(MaterialApp(
      theme: RamoTheme.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.4)),
        child: child!,
      ),
      home: PassengerBenefitsScreen(service: service),
    ));
    await tester.pumpAndSettle();
    final birthday = find.byKey(const Key('benefits-birthday-input'));
    await tester.scrollUntilVisible(birthday, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.enterText(birthday, '05/10');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    final save = find.text('Salvar preferências');
    await tester.scrollUntilVisible(save, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(saved?['birthdayMonthDay'], '10-05');
    expect(find.text('Preferências salvas. Você pode mudar quando quiser.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
