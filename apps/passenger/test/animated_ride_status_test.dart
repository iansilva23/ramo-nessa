import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/widgets/animated_ride_status.dart';

void main() {
  testWidgets('busca, aceite, chegada e início trocam estado sem overflow a 320px',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    Future<void> show(String label) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: AnimatedRideStatus(label: label),
            ),
          ),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text(label), findsOneWidget);
      expect(tester.takeException(), isNull);
    }

    await show('Procurando motorista');
    await show('Seu motorista está a caminho');
    await show('Seu motorista chegou');
    await show('Corrida em andamento');
    await show('Corrida finalizada');
  });

  testWidgets('atualização com mesmo texto preserva identidade e não reinicia',
      (tester) async {
    Widget screen(String status) => MaterialApp(
      home: Scaffold(body: AnimatedRideStatus(label: status)),
    );
    await tester.pumpWidget(screen('Seu motorista está a caminho'));
    await tester.pump();
    final original = tester.widget<Text>(find.text('Seu motorista está a caminho'));
    await tester.pumpWidget(screen('Seu motorista está a caminho'));
    await tester.pump();
    final repeated = tester.widget<Text>(find.text('Seu motorista está a caminho'));
    expect(original.key, repeated.key);
    expect(find.byType(AnimatedSwitcher), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('respeita configuração de reduzir animações do aparelho',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: AnimatedRideStatus(label: 'Corrida em andamento'),
        ),
      ),
    ));
    final switcher = tester.widget<AnimatedSwitcher>(find.byType(AnimatedSwitcher));
    expect(switcher.duration, Duration.zero);
    expect(find.text('Corrida em andamento'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
