import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  test('navigation labels remain readable in both appearances', () {
    for (final theme in [RamoTheme.light, RamoTheme.dark]) {
      final bar = theme.navigationBarTheme;
      final background = bar.backgroundColor!;
      for (final states in [<WidgetState>{}, <WidgetState>{WidgetState.selected}]) {
        final foreground = Color.alphaBlend(bar.labelTextStyle!.resolve(states)!.color!, background);
        final a = foreground.computeLuminance();
        final b = background.computeLuminance();
        final ratio = ((a > b ? a : b) + 0.05) / ((a < b ? a : b) + 0.05);
        expect(ratio, greaterThanOrEqualTo(4.5));
      }
    }
  });
  test('light and dark themes build with expected brightness', () {
    final light = RamoTheme.light;
    final dark = RamoTheme.dark;

    expect(light.brightness, Brightness.light);
    expect(dark.brightness, Brightness.dark);
    expect(light.colorScheme.secondary, RamoColors.signal);
    expect(dark.colorScheme.secondary, RamoColors.signal);
  });

  test('dark input focus remains visible', () {
    final focusedBorder = RamoTheme.dark.inputDecorationTheme.focusedBorder;

    expect(focusedBorder, isA<OutlineInputBorder>());
    expect(
      (focusedBorder! as OutlineInputBorder).borderSide.color,
      RamoColors.signal,
    );
  });

  test('core design tokens stay valid', () {
    expect(RamoRadius.sm, greaterThan(0));
    expect(RamoRadius.md, greaterThan(RamoRadius.sm));
    expect(RamoRadius.lg, greaterThan(RamoRadius.md));
    expect(RamoMotion.fast, lessThan(RamoMotion.standard));
    expect(RamoMotion.standard, lessThan(RamoMotion.emphasized));
  });
}
