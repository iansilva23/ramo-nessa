import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/config/driver_web_heading_config.dart';

/// Visual north compass. Does not read device magnetometers: it reflects
/// the actual rotation applied to the vector Google Map, so it stays aligned.
class DriverWebHeadingCompass extends StatelessWidget {
  const DriverWebHeadingCompass({super.key, required this.heading});

  final ValueListenable<double> heading;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ValueListenableBuilder<double>(
        valueListenable: heading,
        builder: (context, degrees, _) => Semantics(
          label: 'Bússola, norte em ${DriverWebHeadingConfig.northNeedleDegrees(degrees).round()} graus',
          child: Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              color: const Color(0xEF111111),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0x40FFFFFF)),
              boxShadow: const [
                BoxShadow(
                  blurRadius: 10,
                  offset: Offset(0, 3),
                  color: Color(0x28000000),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Transform.rotate(
                  angle: DriverWebHeadingConfig.northNeedleDegrees(degrees) *
                      math.pi / 180,
                  child: const Icon(
                    Icons.navigation_rounded,
                    size: 29,
                    color: Color(0xFFFFD000),
                  ),
                ),
                const Text(
                  'N',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
