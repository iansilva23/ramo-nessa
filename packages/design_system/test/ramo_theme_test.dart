import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
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
