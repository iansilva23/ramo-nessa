import 'package:flutter/material.dart';

abstract final class RamoSpacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 20.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

abstract final class RamoRadius {
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 28.0;
  static const pill = 999.0;
}

abstract final class RamoMotion {
  static const fast = Duration(milliseconds: 140);
  static const standard = Duration(milliseconds: 220);
  static const emphasized = Duration(milliseconds: 360);

  static const standardCurve = Curves.easeOutCubic;
  static const emphasizedCurve = Curves.easeOutQuart;
}

abstract final class RamoElevation {
  static List<BoxShadow> floating(BuildContext context) => [
        BoxShadow(
          color: Colors.black.withValues(
            alpha: Theme.of(context).brightness == Brightness.dark ? 0.24 : 0.07,
          ),
          blurRadius: 28,
          offset: const Offset(0, 10),
        ),
      ];
}
