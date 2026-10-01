import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_ranking_benefits_screen.dart';

void main() {
  testWidgets('ranking e beneficios aparece apenas como em breve', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: DriverRankingBenefitsScreen(),
      ),
    );

    expect(find.text('Ranking & Benefícios'), findsWidgets);
    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.text('Seu destaque vai valer ainda mais.'), findsOneWidget);
    expect(
      find.textContaining('categoria e região'),
      findsWidgets,
    );

    expect(find.textContaining('Pagar'), findsNothing);
    expect(find.textContaining('Sacar'), findsNothing);
  });
}
