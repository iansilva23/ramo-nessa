import 'package:flutter/material.dart';

import '../foundation/ramo_colors.dart';
import '../foundation/ramo_tokens.dart';

abstract final class RamoTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: RamoColors.ink,
      brightness: Brightness.light,
      primary: RamoColors.ink,
      secondary: RamoColors.signal,
      surface: RamoColors.surface,
      error: RamoColors.danger,
    );

    return _base(scheme).copyWith(
      scaffoldBackgroundColor: RamoColors.canvas,
      dividerColor: RamoColors.border,
      inputDecorationTheme: _inputDecoration(
        fill: RamoColors.surface,
        border: RamoColors.border,
        focusedBorderColor: RamoColors.ink,
      ),
      navigationBarTheme: _navigationBar(
        background: RamoColors.surface,
        indicator: RamoColors.signal,
        foreground: RamoColors.ink,
      ),
    );
  }

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: RamoColors.signal,
      brightness: Brightness.dark,
      primary: RamoColors.signal,
      secondary: RamoColors.signal,
      surface: RamoColors.darkSurface,
      error: RamoColors.danger,
    );

    return _base(scheme).copyWith(
      scaffoldBackgroundColor: RamoColors.darkCanvas,
      dividerColor: RamoColors.darkBorder,
      inputDecorationTheme: _inputDecoration(
        fill: RamoColors.darkRaised,
        border: RamoColors.darkBorder,
        focusedBorderColor: RamoColors.signal,
      ),
      navigationBarTheme: _navigationBar(
        background: RamoColors.darkSurface,
        indicator: RamoColors.signal,
        foreground: Colors.white,
      ),
    );
  }

  static ThemeData _base(ColorScheme scheme) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      // InkRipple is deterministic across platforms and widget tests.
      splashFactory: InkRipple.splashFactory,
      textTheme: base.textTheme.copyWith(
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -1.0,
        ),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.7,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
        ),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.35),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.35),
      ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.6,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(58),
          backgroundColor: RamoColors.brandBlack,
          foregroundColor: Colors.white,
          disabledBackgroundColor: RamoColors.border,
          disabledForegroundColor: RamoColors.muted,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(RamoRadius.md),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RamoRadius.md),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        showDragHandle: false,
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: RamoColors.ink,
        textColor: RamoColors.ink,
        contentPadding: EdgeInsets.symmetric(horizontal: 4),
      ),
    );
  }

  static InputDecorationTheme _inputDecoration({
    required Color fill,
    required Color border,
    required Color focusedBorderColor,
  }) {
    OutlineInputBorder shape(Color color, {double width = 1}) {
      return OutlineInputBorder(
        borderRadius: BorderRadius.circular(RamoRadius.md),
        borderSide: BorderSide(color: color, width: width),
      );
    }

    return InputDecorationTheme(
      filled: true,
      fillColor: fill,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: RamoSpacing.md,
        vertical: 17,
      ),
      border: shape(Colors.transparent),
      enabledBorder: shape(Colors.transparent),
      focusedBorder: shape(focusedBorderColor, width: 1.4),
      errorBorder: shape(RamoColors.danger),
      focusedErrorBorder: shape(RamoColors.danger, width: 1.4),
    );
  }

  static NavigationBarThemeData _navigationBar({
    required Color background,
    required Color indicator,
    required Color foreground,
  }) {
    return NavigationBarThemeData(
      elevation: 0,
      backgroundColor: background,
      indicatorColor: indicator,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(
          color: foreground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
