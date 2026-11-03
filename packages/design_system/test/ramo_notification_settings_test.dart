import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets('carrega preferência e sincroniza escolha sem solicitar permissão', (tester) async {
    var prompts = 0;
    bool? saved;
    await tester.pumpWidget(MaterialApp(home: RamoNotificationSettings(
      readPreference: () async => true,
      savePreference: (value) async { saved = value; return true; },
      requestNotifications: () async { prompts++; return true; },
      notificationHelp: () => 'Avisos de corrida',
    )));
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, true);
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    expect(saved, false);
    expect(prompts, 0);
    expect(find.text('Preferência salva.'), findsOneWidget);
  });

  testWidgets('não confirma ativação nem sincronização quando o Core falha', (tester) async {
    await tester.pumpWidget(MaterialApp(home: RamoNotificationSettings(
      readPreference: () async => false,
      savePreference: (_) async => false,
      requestNotifications: () async => false,
      notificationHelp: () => 'Instale na Tela de Início',
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ativar ou verificar notificações'));
    await tester.pumpAndSettle();
    expect(find.textContaining('A ativação não foi confirmada'), findsOneWidget);
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    expect(find.textContaining('sincronização dos avisos está pendente'), findsOneWidget);
  });
  testWidgets('provedor sem resposta libera a tela para tentar de novo', (tester) async {
    final pending = Completer<bool>();
    await tester.pumpWidget(MaterialApp(home: RamoNotificationSettings(
      readPreference: () async => false,
      savePreference: (_) async => false,
      requestNotifications: () => pending.future,
      notificationHelp: () => 'Notificações',
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ativar ou verificar notificações'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 31));
    await tester.pumpAndSettle();
    expect(find.textContaining('A ativação não foi confirmada'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
    pending.complete(false);
    await tester.pumpAndSettle();
  });

}
