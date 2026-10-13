import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets('onboarding é mostrado após o login e concluído uma vez', (tester) async {
    var saved = false;
    var locationCalls = 0;
    await tester.pumpWidget(MaterialApp(
      home: RamoPermissionOnboardingGate(
        role: 'passenger',
        web: true,
        readCompleted: () async => saved,
        saveCompleted: () async { saved = true; },
        requestLocation: () async { locationCalls++; return true; },
        requestNotifications: () async => false,
        saveNotificationPreference: (_) async {},
        child: const Scaffold(body: Text('Mapa aprovado')),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Tudo pronto para ir nessa?'), findsOneWidget);
    expect(find.text('Adicionar à Tela de Início'), findsOneWidget);
    await tester.tap(find.text('Ativar').first);
    await tester.pumpAndSettle();
    expect(locationCalls, 1);
    await tester.ensureVisible(find.text('Continuar para o Ramo Nessa'));
    await tester.tap(find.text('Continuar para o Ramo Nessa'));
    await tester.pumpAndSettle();
    expect(saved, true);
    expect(find.text('Mapa aprovado'), findsOneWidget);
  });

  testWidgets('driver pode entrar no perfil mesmo sem autorização opcional', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: RamoPermissionOnboardingGate(
        role: 'driver',
        web: false,
        readCompleted: () async => false,
        saveCompleted: () async {},
        requestLocation: () async => false,
        requestNotifications: () async => false,
        saveNotificationPreference: (_) async {},
        child: const Scaffold(body: Text('Perfil do motorista')),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Não perca nenhuma corrida'), findsOneWidget);
    expect(find.textContaining('Para ficar online'), findsOneWidget);
    await tester.ensureVisible(find.text('Continuar para o Ramo Nessa'));
    await tester.tap(find.text('Continuar para o Ramo Nessa'));
    await tester.pumpAndSettle();
    expect(find.text('Perfil do motorista'), findsOneWidget);
  });
}
