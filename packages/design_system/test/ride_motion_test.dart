import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets('ride motion respects reduced motion and remains accessible',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(const MaterialApp(
        home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: Scaffold(
                body: Column(children: [
              RamoSearchPulse(label: 'Aguardando o motorista aceitar'),
              RamoSuccessMark(),
              RamoOfferCountdown(seconds: 7),
            ])))));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Aguardando o motorista aceitar'),
        findsOneWidget);
    expect(find.bySemanticsLabel('7 segundos para responder'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    semantics.dispose();
  });
}
