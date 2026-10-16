import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/src/onboarding/ramo_web_setup.dart';

void main() {
  Future<void> show(WidgetTester tester, {
    Map<String, Object?> state = const {},
    Future<Map<String, Object?>> Function()? snapshot,
    Future<String> Function()? install,
    String role = 'passenger',
  }) async {
    await tester.pumpWidget(MaterialApp(home: RamoWebSetup(
      role: role,
      // The optional banner must never depend on storage or request permissions.
      readCompleted: () async => throw StateError('must not read completion'),
      saveCompleted: () async => throw StateError('must not write completion'),
      readSnapshot: snapshot ?? () async => state,
      requestLocation: () async => throw StateError('must not request GPS'),
      requestNotifications: () async => throw StateError('must not request push'),
      install: install ?? () async => 'manual',
      readNotificationPreference: () async => throw StateError('must not read preference'),
      saveNotificationPreference: (_) async => throw StateError('must not change preference'),
      child: const Scaffold(body: Center(child: Text('App aberto'))),
    )));
    await tester.pumpAndSettle();
  }
  Future<void> tap(WidgetTester tester, String text) async {
    await tester.tap(find.text(text)); await tester.pumpAndSettle();
  }
  testWidgets('app opens immediately without permissions or completion storage', (tester) async {
    await show(tester, state: {'ios': true});
    expect(find.text('App aberto'), findsOneWidget);
    expect(find.text('Adicionar app à Tela de Início'), findsOneWidget);
    expect(find.text('Ative sua localização'), findsNothing);
    await tester.tap(find.byTooltip('Fechar aviso de instalação')); await tester.pumpAndSettle();
    expect(find.text('Adicionar app à Tela de Início'), findsNothing);
    expect(find.text('App aberto'), findsOneWidget);
  });
  testWidgets('installed mode hides banner for both roles', (tester) async {
    for (final role in ['driver', 'passenger']) {
      await show(tester, role: role, state: {'standalone': true});
      expect(find.text('App aberto'), findsOneWidget);
      expect(find.text('Adicionar app à Tela de Início'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    }
  });
  testWidgets('iPhone instructions appear only after tapping and can close', (tester) async {
    await show(tester, state: {'ios': true});
    expect(find.textContaining('1. Abra este endereço'), findsNothing);
    await tap(tester, 'Adicionar app à Tela de Início');
    expect(find.textContaining('1. Abra este endereço no Safari'), findsOneWidget);
    await tap(tester, 'Entendi');
    expect(find.text('App aberto'), findsOneWidget);
    expect(find.textContaining('1. Abra este endereço'), findsNothing);
  });
  testWidgets('slow or failed snapshot never blocks app', (tester) async {
    final pending = Completer<Map<String, Object?>>();
    await show(tester, snapshot: () => pending.future);
    expect(find.text('App aberto'), findsOneWidget);
    pending.completeError(StateError('unavailable')); await tester.pumpAndSettle();
    expect(find.text('App aberto'), findsOneWidget);
  });
  testWidgets('repeated taps cannot trigger simultaneous install requests', (tester) async {
    final pending = Completer<String>(); var calls = 0;
    await show(tester, install: () { calls++; return pending.future; });
    await tester.tap(find.text('Adicionar app à Tela de Início')); await tester.pump();
    await tester.tap(find.text('Aguarde…')); await tester.pump();
    expect(calls, 1);
    pending.complete('dismissed'); await tester.pumpAndSettle();
    expect(find.text('Adicionar à Tela de Início'), findsNothing);
    expect(find.text('App aberto'), findsOneWidget);
  });
  testWidgets('accepting prompt does not pretend installation finished', (tester) async {
    await show(tester, install: () async => 'accepted');
    await tap(tester, 'Adicionar app à Tela de Início');
    expect(find.text('Adicionar app à Tela de Início'), findsOneWidget);
    expect(find.textContaining('Instalação solicitada.'), findsOneWidget);
  });
  testWidgets('confirmed installation hides banner after refresh', (tester) async {
    var installed = false;
    await show(tester, snapshot: () async => {'installed': installed},
      install: () async { installed = true; return 'installed'; });
    await tap(tester, 'Adicionar app à Tela de Início');
    expect(find.text('Adicionar app à Tela de Início'), findsNothing);
    expect(find.text('App aberto'), findsOneWidget);
  });
  testWidgets('banner respects safe area and has a generous tap target on small screens', (tester) async {
    tester.view.physicalSize = const Size(320, 568); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    await show(tester);
    final banner = tester.getRect(find.text('Adicionar app à Tela de Início'));
    final app = tester.getRect(find.text('App aberto'));
    expect(banner.bottom, lessThan(app.top));
    expect(tester.takeException(), isNull);
  });
  testWidgets('appearance and dismissal preserve the app subtree state', (tester) async {
    final pending = Completer<Map<String, Object?>>();
    var starts = 0;
    await tester.pumpWidget(MaterialApp(home: RamoWebSetup(
      role: 'passenger', readCompleted: () async => false,
      saveCompleted: () async {}, readSnapshot: () => pending.future,
      requestLocation: () async => 'granted', requestNotifications: () async => true,
      install: () async => 'manual', saveNotificationPreference: (_) async {},
      child: _StatefulApp(onStart: () => starts++),
    )));
    await tester.pump(); expect(starts, 1);
    pending.complete({'ios': true}); await tester.pumpAndSettle();
    expect(starts, 1);
    await tester.tap(find.byTooltip('Fechar aviso de instalação')); await tester.pumpAndSettle();
    expect(starts, 1);
  });

}

class _StatefulApp extends StatefulWidget {
  const _StatefulApp({required this.onStart});
  final VoidCallback onStart;
  @override
  State<_StatefulApp> createState() => _StatefulAppState();
}
class _StatefulAppState extends State<_StatefulApp> {
  @override
  void initState() { super.initState(); widget.onStart(); }
  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('App state retained'));
}
