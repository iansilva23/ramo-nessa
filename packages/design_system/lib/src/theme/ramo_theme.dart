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
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.macOS: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.fuchsia: FadeUpwardsPageTransitionsBuilder(),
        },
      ),
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
        toolbarHeight: 64,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        titleSpacing: RamoSpacing.lg,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 21,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.55,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
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
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RamoRadius.md),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: RamoColors.brandBlack,
        contentTextStyle: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RamoRadius.md),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size.square(44),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        showDragHandle: false,
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: scheme.onSurface,
        textColor: scheme.onSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 4),
        minVerticalPadding: 10,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 15.5,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.15,
        ),
        subtitleTextStyle: const TextStyle(
          color: RamoColors.muted,
          fontSize: 13,
          height: 1.3,
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? RamoColors.brandBlack
              : RamoColors.muted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? RamoColors.brandYellow
              : RamoColors.border,
        ),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
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
      height: 68,
      elevation: 0,
      backgroundColor: background,
      indicatorColor: indicator,
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RamoRadius.pill),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? RamoColors.brandBlack
              : RamoColors.muted,
          size: states.contains(WidgetState.selected) ? 24 : 22,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected)
              ? foreground
              : RamoColors.muted,
          fontSize: 11.5,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w800
              : FontWeight.w600,
          letterSpacing: -0.1,
        ),
      ),
    );
  }
}
