import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
void main() {
  test('appearance persists and restores all supported choices', () async {
    String? saved;
    final first=RamoAppearance();
    await first.initialize(read: () async => saved, save: (value) async { saved=value; });
    for (final mode in ThemeMode.values) {
      expect(await first.select(mode), true);
      final restored=RamoAppearance();
      await restored.initialize(read: () async => saved,save: (value) async {saved=value;});
      expect(restored.value, mode);
    }
    await first.initialize(read: () async => 'unknown',save: (_) async {});
    expect(first.value,ThemeMode.system);
  });
  testWidgets('dark appearance remains legible and can select light or system', (tester) async {
    await RamoAppearance.instance.initialize(read: () async => 'dark',save: (_) async {});
    addTearDown(() {RamoAppearance.instance.value=ThemeMode.system;});
    await tester.pumpWidget(ValueListenableBuilder<ThemeMode>(valueListenable:RamoAppearance.instance,
      builder:(context,mode,_)=>MaterialApp(theme:RamoTheme.light,darkTheme:RamoTheme.dark,themeMode:mode,
        home:const Scaffold(body:Column(children:[RamoBrandLockup(),RamoAppearanceTile()])))));
    final text=tester.widget<Text>(find.text('RAMO NESSA'));
    expect(text.style!.color, RamoTheme.dark.colorScheme.onSurface);
    await tester.tap(find.text('Aparência'));
    await tester.pumpAndSettle();
    expect(find.text('Seguir sistema'),findsOneWidget);
    await tester.tap(find.text('Claro'));
    await tester.pumpAndSettle();
    expect(RamoAppearance.instance.value,ThemeMode.light);
    expect(find.text('Claro'),findsOneWidget);
  });
}
