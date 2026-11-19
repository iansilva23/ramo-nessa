import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  test('official brand palette stays yellow and black', () {
    expect(RamoColors.brandYellow, const Color(0xFFFAD50E));
    expect(RamoColors.brandBlack, const Color(0xFF0D0D0D));
    expect(RamoColors.signal, RamoColors.brandYellow);
    expect(RamoColors.signalInk, RamoColors.brandBlack);
  });

  testWidgets('brand lockup exposes the Ramo Nessa identity', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RamoBrandLockup(),
        ),
      ),
    );

    expect(find.text('RAMO NESSA'), findsOneWidget);
    expect(find.bySemanticsLabel('Ramo Nessa'), findsOneWidget);
  });

  testWidgets('brand lockup uses the official mark for each contrast', (
    tester,
  ) async {
    for (final theme in [ThemeData.light(), ThemeData.dark()]) {
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: const Scaffold(body: RamoBrandLockup()),
        ),
      );
      final mark = tester.widget<Image>(find.byType(Image)).image as AssetImage;
      final variant = theme.brightness == Brightness.dark
          ? 'driver'
          : 'passenger';
      expect(mark.assetName, 'assets/auth/ramo_mark_$variant.png');
      expect(mark.package, 'ramo_design_system');
    }
  });
}
