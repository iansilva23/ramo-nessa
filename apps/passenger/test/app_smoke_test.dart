import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/app.dart';

void main() {
  testWidgets('home renderiza sem exceções e mostra ação principal', (tester) async {
    await tester.pumpWidget(const RamoNessaPassengerApp());
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Ramo Nessa'), findsOneWidget);
    expect(find.text('Pra onde vamos?'), findsOneWidget);

    // Dispose explicitamente os tickers do mapa antes de encerrar o teste.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();

    expect(tester.takeException(), isNull);
  });
}
