import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/registration/driver_registration_service.dart';
import 'package:ramo_nessa_driver/src/features/registration/driver_registration_gate.dart';
import 'package:ramo_nessa_driver/src/preview/driver_preview_dependencies.dart';

class _Registration implements DriverRegistrationService {
  Map<String, dynamic>? submitted;
  Map<String, dynamic> response = {
    'status': 'pending',
    'documentsSubmitted': true,
    'documents': [],
  };
  @override
  Future<Map<String, dynamic>> status() async => response;
  @override
  Future<Map<String, dynamic>> submit(Map<String, dynamic> data) async {
    submitted = data;
    return {...response, 'needsCpf': false};
  }
}

void main() {
  testWidgets('driver registration requires valid CPF before vehicle step', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _Registration()..response = {'status': 'incomplete'};
    await tester.pumpWidget(
      MaterialApp(
        home: DriverRegistrationGate(
          service: service,
          api: DriverPreviewDependencies().api,
          logout: () async => true,
          homeBuilder: () => const Text('MAPA LIBERADO'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nome completo'),
      'Motorista Teste',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'CPF do motorista'),
      '11111111111',
    );
    await tester.tap(find.byKey(const Key('registration-continue')));
    await tester.pumpAndSettle();
    expect(find.text('Informe um CPF válido.'), findsOneWidget);
    expect(find.text('Seu veículo'), findsNothing);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'CPF do motorista'),
      '529.982.247-25',
    );
    await tester.tap(find.byKey(const Key('registration-continue')));
    await tester.pumpAndSettle();
    expect(find.text('Seu veículo'), findsOneWidget);
  });
}
