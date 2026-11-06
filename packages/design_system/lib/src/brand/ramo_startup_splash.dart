import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../foundation/ramo_colors.dart';
import 'ramo_brand_lockup.dart';

/// Entrada cinematográfica compartilhada enquanto o app inicializa.
class RamoStartupSplash extends StatefulWidget {
  const RamoStartupSplash({super.key, this.label});

  final String? label;

  @override
  State<RamoStartupSplash> createState() => _RamoStartupSplashState();
}

class _RamoStartupSplashState extends State<RamoStartupSplash>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2800),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final animation = reduceMotion ? const AlwaysStoppedAnimation(1.0) : _controller;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            final t = animation.value;
            final artT = Curves.easeOutBack.transform(math.min(1, t / .56));
            final brandT = Curves.easeOutCubic.transform(
              ((t - .36) / .42).clamp(0.0, 1.0).toDouble(),
            );
            final labelT = Curves.easeOut.transform(
              ((t - .62) / .3).clamp(0.0, 1.0).toDouble(),
            );
            return Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Transform.translate(
                      offset: Offset(0, 30 * (1 - artT)),
                      child: Transform.scale(
                        scale: .78 + (.22 * artT),
                        child: Opacity(
                          opacity: math.min(1, t * 3.1),
                          child: const Image(
                            image: AssetImage(
                              'assets/auth/splash_mobility.png',
                              package: 'ramo_design_system',
                            ),
                            width: 310,
                            height: 310,
                            fit: BoxFit.contain,
                            semanticLabel: 'Mobilidade Ramo Nessa',
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ClipRect(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        widthFactor: brandT,
                        child: const RamoBrandLockup(),
                      ),
                    ),
                    if (widget.label != null) ...[
                      const SizedBox(height: 14),
                      Opacity(
                        opacity: labelT,
                        child: Text(
                          widget.label!,
                          style: const TextStyle(
                            color: RamoColors.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.8,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    Opacity(
                      opacity: labelT,
                      child: const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: RamoColors.brandYellow,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
