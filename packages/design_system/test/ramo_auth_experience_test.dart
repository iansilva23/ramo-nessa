import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets('auth experience keeps the real form over a fallback hero', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: RamoAuthScaffold(child: Text('Entrar com segurança')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Entrar com segurança'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('route submit button exposes its route animation while loading', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RamoRouteSubmitButton(
            label: 'Entrar',
            loading: true,
            onPressed: null,
          ),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('route-loading')), findsOneWidget);
    expect(find.text('Entrar'), findsNothing);
  });
}
