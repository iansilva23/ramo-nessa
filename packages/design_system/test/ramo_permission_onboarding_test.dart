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
    expect(find.text('Adicionar à Tela de Início'), findsNothing);
    await tester.tap(find.text('Ativar').first);
    await tester.pumpAndSettle();
    expect(locationCalls, 1);
    await tester.ensureVisible(find.text('Continuar para o Ramo Nessa'));
    await tester.tap(find.text('Continuar para o Ramo Nessa'));
    await tester.pumpAndSettle();
    expect(saved, true);
    expect(find.text('Mapa aprovado'), findsOneWidget);
  });

  testWidgets('Web no navegador mantém o conteúdo e não pede instalação', (tester) async {
    await tester.pumpWidget(MaterialApp(home: RamoPermissionOnboardingGate(
      role: 'passenger',
      web: true,
      readCompleted: () async => false,
      saveCompleted: () async {},
      readWebSetup: () async => {'ios': true, 'installed': false},
      requestWebLocation: () async => 'granted',
      installWebApp: () async => throw StateError('install must not be called'),
      requestLocation: () async => true,
      requestNotifications: () async => false,
      saveNotificationPreference: (_) async {},
      child: const Scaffold(body: Text('Mapa normal no navegador')),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Mapa normal no navegador'), findsOneWidget);
    expect(find.text('Adicionar app à Tela de Início'), findsNothing);
    expect(find.text('Adicionar à Tela de Início'), findsNothing);
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
  testWidgets('Web permite ativação por toque e mantém a preferência carregada', (tester) async {
    var prompts = 0;
    bool? saved;
    await tester.pumpWidget(MaterialApp(home: RamoPermissionOnboardingGate(
      role: 'passenger', web: true,
      readCompleted: () async => false, saveCompleted: () async {},
      requestLocation: () async => false,
      requestNotifications: () async { prompts++; return true; },
      notificationHelp: () => 'Abra pela Tela de Início',
      readNotificationPreference: () async => true,
      saveNotificationPreference: (all) async { saved = all; },
      child: const Scaffold(body: Text('Mapa')),
    )));
    await tester.pumpAndSettle();
    expect(prompts, 0);
    expect(find.text('Em breve'), findsNothing);
    expect(find.text('Abra pela Tela de Início'), findsOneWidget);
    await tester.ensureVisible(find.text('Ativar').last);
    await tester.tap(find.text('Ativar').last);
    await tester.pumpAndSettle();
    expect(prompts, 1);
    await tester.ensureVisible(find.text('Continuar para o Ramo Nessa'));
    await tester.tap(find.text('Continuar para o Ramo Nessa'));
    await tester.pumpAndSettle();
    expect(saved, true);
    expect(find.text('Mapa'), findsOneWidget);
  });

  testWidgets('falha na preferência não bloqueia o app e informa a pendência', (tester) async {
    var completed = false;
    await tester.pumpWidget(MaterialApp(home: RamoPermissionOnboardingGate(
      role: 'driver', web: true,
      readCompleted: () async => false,
      saveCompleted: () async { completed = true; },
      requestLocation: () async => false,
      requestNotifications: () async => false,
      saveNotificationPreference: (_) async => throw StateError('offline'),
      child: const Scaffold(body: Text('Perfil disponível')),
    )));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Continuar para o Ramo Nessa'));
    await tester.tap(find.text('Continuar para o Ramo Nessa'));
    await tester.pumpAndSettle();
    expect(completed, true);
    expect(find.text('Perfil disponível'), findsOneWidget);
    expect(find.textContaining('configuração dos avisos não foi confirmada'), findsOneWidget);
  });

}
