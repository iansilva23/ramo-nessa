import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/src/onboarding/ramo_web_setup.dart';

void main() {
  Future<void> show(WidgetTester tester, {
    Map<String, Object?> state = const {},
    Future<Map<String, Object?>> Function()? snapshot,
    Future<String> Function()? location,
    Future<bool> Function()? notifications,
    Future<String> Function()? install,
    Future<void> Function()? save,
    String role = 'passenger',
  }) async {
    await tester.pumpWidget(MaterialApp(home: RamoWebSetup(
      role: role, readCompleted: () async => false,
      saveCompleted: save ?? () async {},
      readSnapshot: snapshot ?? () async => state,
      requestLocation: location ?? () async => 'granted',
      requestNotifications: notifications ?? () async => true,
      install: install ?? () async => 'manual',
      saveNotificationPreference: (_) async {},
      child: const Scaffold(body: Text('App aberto')),
    )));
    await tester.pumpAndSettle();
  }
  Future<void> tap(WidgetTester tester, String text) async {
    await tester.ensureVisible(find.text(text));
    await tester.tap(find.text(text));
    await tester.pumpAndSettle();
  }
  testWidgets('iPhone apresenta instalação primeiro e não pede permissões ao abrir', (tester) async {
    var location = 0, notifications = 0;
    await show(tester, state: {'ios': true, 'notification': 'install'},
      location: () async { location++; return 'granted'; },
      notifications: () async { notifications++; return true; });
    expect(find.text('Adicione à Tela de Início'), findsOneWidget);
    expect(find.textContaining('1. No Safari'), findsOneWidget);
    expect(location, 0); expect(notifications, 0);
    await tap(tester, 'Continuar no navegador por enquanto');
    expect(find.text('Ative sua localização'), findsOneWidget);
    await tap(tester, 'Usar endereço manual por enquanto');
    expect(find.text('Ativar notificações'), findsNothing);
    expect(find.textContaining('só podem ser ativados'), findsOneWidget);
    expect(notifications, 0);
  });
  testWidgets('PWA instalada pula instalação e localiza por um toque', (tester) async {
    var calls = 0;
    await show(tester, state: {'installed': true, 'standalone': true, 'location': 'unknown', 'notification': 'prompt'},
      location: () async { calls++; return 'granted'; });
    expect(find.text('Ative sua localização'), findsOneWidget);
    await tap(tester, 'Ativar localização');
    expect(calls, 1); expect(find.text('Localização permitida neste navegador.'), findsOneWidget);
    await tap(tester, 'Continuar');
    expect(find.text('Ative os avisos'), findsOneWidget);
  });
  testWidgets('timeout de GPS tem recuperação própria e não é permissão negada', (tester) async {
    await show(tester, state: {'installed': true}, location: () async => 'timeout');
    await tap(tester, 'Ativar localização');
    expect(find.textContaining('GPS demorou'), findsOneWidget);
    expect(find.textContaining('foi bloqueada'), findsNothing);
    expect(find.text('Tentar localização novamente'), findsOneWidget);
  });
  testWidgets('bloqueio de localização orienta liberar e permite seguir manualmente', (tester) async {
    await show(tester, state: {'installed': true, 'location': 'denied', 'ios': true});
    expect(find.textContaining('A localização foi bloqueada'), findsOneWidget);
    expect(find.textContaining('Ajustes do Site'), findsOneWidget);
    await tap(tester, 'Usar endereço manual por enquanto');
    expect(find.text('Ative os avisos'), findsOneWidget);
  });
  testWidgets('permissão concedida sem registro push não vira sucesso', (tester) async {
    var calls = 0;
    await show(tester, state: {'installed': true, 'location': 'granted', 'notification': 'granted'},
      notifications: () async { calls++; return false; });
    await tap(tester, 'Continuar');
    await tap(tester, 'Concluir ativação dos avisos');
    expect(calls, 1);
    expect(find.textContaining('cadastro dos avisos não terminou'), findsOneWidget);
    await tap(tester, 'Continuar sem notificações por enquanto');
    expect(find.text('Notificações não ativadas'), findsOneWidget);
  });
  testWidgets('recusa de notificações não dispara novo pedido e reconsulta ao voltar', (tester) async {
    var calls = 0;
    var permission = 'denied';
    await show(tester, snapshot: () async => {'installed': true, 'location': 'granted', 'notification': permission},
      notifications: () async { calls++; return true; });
    await tap(tester, 'Continuar');
    expect(find.text('Ativar notificações'), findsNothing);
    permission = 'granted';
    await tap(tester, 'Verificar novamente');
    expect(find.text('Concluir ativação dos avisos'), findsOneWidget);
    expect(calls, 0);
  });
  testWidgets('motorista pode acessar perfil sem declarar GPS/notificações ativos', (tester) async {
    var saved = false;
    await show(tester, role: 'driver', state: {'installed': true, 'location': 'denied', 'notification': 'unsupported'},
      save: () async { saved = true; });
    await tap(tester, 'Configurar depois; acessar meu perfil');
    await tap(tester, 'Continuar sem notificações por enquanto');
    expect(find.text('Localização não confirmada'), findsOneWidget);
    expect(find.text('Notificações não ativadas'), findsOneWidget);
    await tap(tester, 'Entrar no Ramo Nessa');
    expect(saved, true); expect(find.text('App aberto'), findsOneWidget);
  });
  testWidgets('falha ao salvar conclusão oferece nova tentativa', (tester) async {
    await show(tester, state: {'installed': true, 'location': 'granted', 'notification': 'ready'},
      save: () async { throw StateError('storage'); });
    await tap(tester, 'Continuar'); await tap(tester, 'Continuar');
    await tap(tester, 'Entrar no Ramo Nessa');
    expect(find.text('App aberto'), findsNothing);
    expect(find.textContaining('Não conseguimos salvar'), findsOneWidget);
  });
  testWidgets('toques repetidos não abrem pedidos de localização simultâneos', (tester) async {
    var calls = 0;
    final pending = Completer<String>();
    await show(tester, state: {'installed': true}, location: () { calls++; return pending.future; });
    await tester.ensureVisible(find.text('Ativar localização'));
    await tester.tap(find.text('Ativar localização')); await tester.pump();
    expect(calls, 1);
    expect(tester.widget<FilledButton>(find.byType(FilledButton).first).onPressed, isNull);
    pending.complete('granted'); await tester.pumpAndSettle();
  });
}
