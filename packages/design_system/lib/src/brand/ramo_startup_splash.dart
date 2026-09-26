import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../brand/ramo_brand_lockup.dart';
import '../foundation/ramo_colors.dart';

/// Entrada de marca usada enquanto o app inicializa serviços locais e remotos.
///
/// Ela aparece no primeiro frame do Flutter para que inicializações como
/// Firebase/Keystore não deixem o usuário parado numa tela nativa vazia.
class RamoStartupSplash extends StatefulWidget {
  const RamoStartupSplash({
    super.key,
    this.label,
  });

  final String? label;

  @override
  State<RamoStartupSplash> createState() => _RamoStartupSplashState();
}

class _RamoStartupSplashState extends State<RamoStartupSplash>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RamoColors.brandBlack,
      body: SafeArea(
        child: Center(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              final t = _controller.value;
              final intro = Curves.easeOutBack.transform(
                math.min(1, t * 2.4),
              );
              final breathe = 1 + (math.sin(t * math.pi * 2) * 0.018);
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Transform.scale(
                    scale: (.84 + (.16 * intro)) * breathe,
                    child: Opacity(
                      opacity: math.min(1, t * 3.2),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 20,
                        ),
                        decoration: BoxDecoration(
                          color: RamoColors.brandYellow,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x3DFAD50E),
                              blurRadius: 34,
                              spreadRadius: 4,
                            ),
                          ],
                        ),
                        child: const RamoBrandLockup(),
                      ),
                    ),
                  ),
                  if (widget.label != null) ...[
                    const SizedBox(height: 22),
                    Text(
                      widget.label!,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                  const SizedBox(height: 30),
                  SizedBox(
                    width: 118,
                    height: 3,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: Stack(
                        children: [
                          const Positioned.fill(
                            child: ColoredBox(color: Color(0x22FFFFFF)),
                          ),
                          FractionallySizedBox(
                            widthFactor: .34,
                            alignment: Alignment(-1 + (t * 2), 0),
                            child: const DecoratedBox(
                              decoration: BoxDecoration(
                                color: RamoColors.brandYellow,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
